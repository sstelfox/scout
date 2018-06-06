/**
 * Requirements:
 *
 * - Respect DNT
 * - Only care about modern browsers (I'm going to use an ES6 module natively,
 *   if the viewer doesn't support ES6 modules natively I don't want to break
 *   things but I don't mind if I don't get the specific stats).
 * - Minimize network requests while still being reliable
 * - Collect enough information to generate the following equivalent stats from
 *   Google Analytics:
 *   - Unique users (returning vs new)
 *   - Page view count broken down by pages
 *   - Page views per session
 *   - When users visit broken down by time
 *   - Where my traffic is coming from (direct, search, referral, other)
 *   - Where my traffic is coming from geographically (by country)
 *   - User retention (for returning viewer how long do they stick around
 *   - User agent breakdown
 *   - Platform breakdown (Linux, Windows, Android, etc)
 *   - How long page views typically last
 *   - How long sessions typically last
 *   - Page / server performance
 *   - Screen size breakdown
 * - Collect some things that Google Analytics doesn't do
 *   - Lifetime page views of a page, maybe throw tags in there as well
 *   - Errors in the tracking script itself
 * - All data should be aggregated so there are is no user identifiable
 *   information or entirely deleted after 7 days regardless of DNT settings
 *   (active sessions and browser sessions may be tricky... I might leave
 *   actives out of it for now)
 *
 * JS agent plan:
 *
 * + Want to detect DNT, otherwise we'll want to know if cookies are
 *   supported, and if we're on a secure site we'll want to use secure cookies
 *   (insecure will mostly be for development).
 * - If DNT is detected, we still want to log page views and performance
 *   information, we just won't associate it with any form of session or the
 *   browser itself. I may still want to log a little bit of information such
 *   as size of display window, but we'll see when I get to that point.
 * + Generate or load a session identifier and a browser identifier, if DNT is
 *   detected this will be the special value 'dnt'. If cookies are supported
 *   I'll want to save/update the respective cookie.
 * + Send initial page view information to the server
 * - Register unload handler to detect when page view is complete
 * - Register performance handler, collect already known performance metrics
 * - Collect additional browser information such as user agent, screen size,
 *   and platform.
 *
 * I generally want to limit this to three requests, the initial page request,
 * the end of page view, and the details in the middle. None should block the
 * browser though.
 */

const config = {
  cookieBrowserIDName: 'bid',
  cookieBrowserExpiration: (60 * 60 * 24 * 10),
  cookiePrefix: '_scout_',
  cookieSessionIDName: 'sid',
  cookieSessionExpiration: (60 * 60 * 2),
  cookieTestName: 'chk',

  // Send queued data at most once every 60 seconds
  dataReportInterval: 60,

  errorEndPoint: 'http://127.0.0.1:9292/api/v1/error',
  trackingEndPoint: 'http://127.0.0.1:9292/api/v1/analytics',
}

const BEACON_TYPE = {
  PAGE_VIEW_START: 0,
  PAGE_VIEW_END: 1,
  PAGE_VIEW_PERFORMANCE: 2,
}

// Collected information that determines runtime behavior including identities
let runtimeInfo = {
  clock: null,

  cookiesSupported: null,
  dntDetected: null,
  useSecureCookie: null,

  browserFirstSeen: null,
  browserID: null,

  sessionFirstSeen: null,
  sessionID: null,
  sessionViewCount: null,

  dataQueue: [],
  queueTimer: null,
}

/**
 *  Returns the name of the cookie with the global prefix.
 *
 *  @param string name
 *  @return string
 */
const cookieName = (name) => {
  return config.cookiePrefix + name;
}

/**
 * Seems like the best way to delete a cookie is to set an expiration value in
 * the past and let the browser clean it up. At the very least this overrides
 * the value present to be empty.
 *
 * @param string name
 */
const deleteCookie = (name) => {
  setCookie(name, '', -2592000);
}

/**
 *  This should be run before anything else, it detects the various required
 *  features and configuration required for the tracker.
 */
const detectRuntimeConfig = () => {
  runtimeInfo.clock = new Date();

  // TODO: Re-enable this once we're done, I don't want to muck with my DNT
  // browser settings just for testing.
  //runtimeInfo.dntDetected = (navigator.doNotTrack === '1');
  runtimeInfo.dntDetected = false;
  runtimeInfo.useSecureCookie = (location.protocol === 'https:');

  // Needs to be run after DNT detection
  runtimeInfo.cookiesSupported = testCookieSupport();
}

/**
 *  Handle errors that crop up during attempt at collecting analytics and
 *  report them to a central server.
 *
 *  @param error error
 */
const errorHandler = (error) => {
  console.error(error);

  navigator.sendBeacon(
    config.errorEndPoint,
    JSON.stringify({
      msg: error.message,
      stack: error.stack,
    })
  );
}

/**
 * Generate an anonymous function that filters all the cookies for one with a
 * specific matching name.
 *
 * @param string name
 * @return function
 */
const generateCookieFilter = (name) => {
  const regex = new RegExp('^' + cookieName(name) + '=(.+)$');
  return (item) => { return item.trim().match(regex) };
}

/**
 * Return the contents of the cookie with the given name. If it isn't set or
 * cookies are disabled this will return null.
 *
 * @param string name
 * @return null|string
 */
const getCookie = (name) => {
  // Don't bother if cookies are supported (this also covers browsers with DNT set)
  if (runtimeInfo.cookiesSupported === false) { return null; }

  // Attempt to find and pull out the requested cookie
  const matchingCookies = document.cookie.split(';').filter(generateCookieFilter(name));

  // No cookie was found
  if (matchingCookies.length === 0) { return null; }

  // We already know we have at least one value, as far as I know browsers will
  // not make more than one cookie available under the same name at once. If
  // this assumption is ever the case I want to know about it.
  if (matchingCookies.length > 1) { reportEdgeCase('Duplicate cookie names do need to be handled...'); }

  return valueDecoder(matchingCookies[0].split('=')[1].trim());
}

/**
 * If there is any queued data this method will trigger a low priority network
 * request to send the data to the analytics server.
 */
const immediateBeaconSend = () => {
  // We don't have any data to send
  if (runtimeInfo.dataQueue.length === 0) { return; }

  const dataPkt = {
    bid: runtimeInfo.browserID,
    sid: runtimeInfo.sessionID,
    svc: runtimeInfo.sessionViewCount,

    data: runtimeInfo.dataQueue,
    ts: runtimeInfo.clock.getTime(),
  }
  runtimeInfo.dataQueue = [];

  if (runtimeInfo.queueTimer !== null) {
    clearInterval(runtimeInfo.queueTimer);
    runtimeInfo.queueTimer = null;
  }

  navigator.sendBeacon(config.trackingEndPoint, JSON.stringify(dataPkt));
}

/**
 *  Batches up data to send. After the dataReportInterval in seconds has
 *  elapsed it will send all data that has been queued up.
 */
const queueData = (data) => {
  runtimeInfo.dataQueue.push(data);

  if (runtimeInfo.queueTimer === null) {
    runtimeInfo.queueTimer = setInterval(immediateBeaconSend, config.dataReportInterval * 1000);
  }
}

/**
 * When a performance entry comes in this parses the object adjusts it for
 * consumption by the server and queued it for transport.
 */
const queuePerformanceEntry = (entry) => {
  // I hate the weird performance API objects, they're inconsistent and can't
  // be modified or dealt with simply. This just ditches the object.
  const simpleData = JSON.parse(JSON.stringify(entry));

  simpleData.ts = runtimeInfo.clock.getTime();
  simpleData.type = BEACON_TYPE.PAGE_VIEW_PERFORMANCE;

  queueData(simpleData);
};

/**
 *  Generate a random value consisting of 8 lowercase alphanumeric characters.
 *  This will be used for identifiers and should be more than enough to
 *  uniquely identify browsers and sessions.
 *
 *  @return string
 */
const randomId = () => {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Start collecting performance entries about resource loading and paints. The
 * data will be queued up and sent in batches.
 */
const recordPerformanceMetrics = () => {
  const observer = new window.PerformanceObserver(list => {
    list.getEntries().forEach((entry) => { queuePerformanceEntry(entry); });
  });

  observer.observe({
    entryTypes: ['frame', 'mark', 'measure', 'navigation', 'paint', 'resource']
  });

  Array.from(performance.getEntries()).forEach((entry) => {
    queuePerformanceEntry(entry);
  });
};

/**
 * Bind our unload handler to the global page unload handler so we can let our
 * analytics server know how long this page view lasted.
 */
const registerUnloadHandler = () => {
  window.addEventListener('unload', unloadHandler);
}

/**
 *  If we hit something I think might be an edge case, we can create an
 *  artificial error and report it through the normal system.
 *
 *  @param string caseName
 */
const reportEdgeCase = (caseName) => {
  errorHandler(new Error('Edge Case: ' + caseName));
}

/**
 * The initial page report of just an individual page view. More detailed
 * metrics will come later. This happens even for DNT users and effectively
 * doesn't contain any information about the user besides when the page view
 * happened.
 */
const reportPageView = () => {
  runtimeInfo.dataQueue.push({
    bfs: runtimeInfo.browserFirstSeen,
    sfs: runtimeInfo.sessionFirstSeen,

    title: document.title,
    url: (location.protocol + '//' + location.host + location.pathname),

    ts: runtimeInfo.clock.getTime(),
    type: BEACON_TYPE.PAGE_VIEW_START,
  });

  immediateBeaconSend();
}

/**
 *  Sets a cookie with the given name to the provided value. If an expiration
 *  is provided, the cookie will automatically expire after the provided number
 *  of seconds.
 *
 *  @param string name
 *  @param string value
 *  @param integer secondsToExpiration
 */
const setCookie = (name, value, secondsToExpiration) => {
  // Don't bother if cookies are supported (this also covers browsers with DNT set)
  if (runtimeInfo.cookiesSupported === false) { return null; }

  let expirationTime = null;
  if (secondsToExpiration) {
    expirationTime = new Date();
    expirationTime.setTime(expirationTime.getTime() + (secondsToExpiration * 1000));
  }

  // TODO: I don't know if I want to be able to configure path or domain
  document.cookie = cookieName(name) + '=' + valueEncoder(value) +
    (expirationTime ? ';expires=' + expirationTime.toUTCString() : '') +
    ';path=/' + (runtimeInfo.useSecureCookie ? ';secure' : '');
}

/**
 * Load a browser identity if one is already set, otherwise, generate a new
 * one. In the event DNT is enabled this will be the special 'dnt' identifier.
 */
const setupBrowserIdentity = () => {
  // DNT enabled clients will return null here
  let bidCookieContents = getCookie(config.cookieBrowserIDName);

  if (bidCookieContents === null) {
    runtimeInfo.browserFirstSeen = runtimeInfo.clock.getTime();
    runtimeInfo.browserID = (runtimeInfo.dntDetected ? 'dnt' : randomId());
  } else {
    let parsedCookie = null;

    try {
      parsedCookie = JSON.parse(bidCookieContents);
    } catch(error) {
      // If the contents are invalid, report the error, clear out the bad
      // cookie and all this function again.
      errorHandler(error);

      deleteCookie(cookieBrowserIDName);
      setupBrowserIdentity();

      return;
    }

    runtimeInfo.browserFirstSeen = parsedCookie.ts;
    runtimeInfo.browserID = parsedCookie.bid;
  }

  setCookie(
    config.cookieBrowserIDName,
    JSON.stringify({
      bid: runtimeInfo.browserID,
      ts: runtimeInfo.browserFirstSeen,
    }),
    config.cookieBrowserExpiration
  );
}

/**
 * Load a session identity if one is already set, otherwise, generate a new
 * one. In the event DNT is enabled this will be the special 'dnt' identifier.
 */
const setupSessionIdentity = () => {
  // DNT enabled clients will return null here
  let sidCookieContents = getCookie(config.cookieSessionIDName);

  if (sidCookieContents === null) {
    runtimeInfo.sessionFirstSeen = runtimeInfo.clock.getTime();
    runtimeInfo.sessionID = (runtimeInfo.dntDetected ? 'dnt' : randomId());
    runtimeInfo.sessionViewCount = 0;
  } else {
    let parsedCookie = null;

    try {
      parsedCookie = JSON.parse(sidCookieContents);
    } catch(error) {
      // If the contents are invalid, report the error, clear out the bad
      // cookie and all this function again.
      errorHandler(error);

      deleteCookie(cookieSessionIDName);
      setupSessionIdentity();

      return;
    }

    runtimeInfo.sessionFirstSeen = parsedCookie.ts;
    runtimeInfo.sessionID = parsedCookie.sid;
    runtimeInfo.sessionViewCount = parsedCookie.svc;
  }

  runtimeInfo.sessionViewCount += 1;

  setCookie(
    config.cookieSessionIDName,
    JSON.stringify({
      sid: runtimeInfo.sessionID,
      svc: runtimeInfo.sessionViewCount,
      ts: runtimeInfo.sessionFirstSeen,
    }),
    config.cookieSessionExpiration
  );
}

/**
 *  Check whether or not we can use cookies during this browser run. The answer
 *  will be no if DNT is detected even if the browser supports it.
 *
 * @return boolean
 */
const testCookieSupport = () => {
  // The browser "doesn't support cookies" to us if DNT is enabled
  if (runtimeInfo.dntDetected) { return false; }

  // Apparently this isn't supported everywhere?
  if (navigator.cookieEnabled !== undefined) { return navigator.cookieEnabled; }

  // Generate a verification value
  const testVal = randomId();

  // Set, read, and clear a testing cookie
  setCookie(config.cookieTestName, testVal);
  const cookieSupport = (getCookie(config.cookieTestName) === testVal);
  deleteCookie(config.cookieTestName);

  return cookieSupport;
}

/**
 *  When this handler gets triggered, queue up a notification that the page
 *  view was complete and send that along with any other queued messages.
 */
const unloadHandler = () => {
  runtimeInfo.dataQueue.push({
    ts: runtimeInfo.clock.getTime(),
    type: BEACON_TYPE.PAGE_VIEW_END,
  });

  immediateBeaconSend();
}

/**
 * This reverses the valueEncoder() encoding, translating back into regular
 * base64, decoding it, then decoding back to the unsafe version.
 *
 * @param string value
 * @return string
 */
const valueDecoder = (value) => {
  // We're starting at websafe base64, we need to turn that to normal base64,
  // then decode it.
  let base64 = value.replace(/\-/g, '+').replace(/_/g, '/') + '=='.substring(0, (3 * value.length) % 4);

  // We need to return our specially encoded values to something decodable, we
  // can brute force this a bit by just re-encoding all the values into hex
  // before decoding them.
  let hexEncoded = atob(base64).split('').map((c) => { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('');

  return decodeURIComponent(hexEncoded);
}

/**
 * To save UTF-8 characters we need to safely get them into individual byte
 * values. There are still plenty of unsafe characters, which we can handle by
 * base64 encoding, and finally replacing the unsafe characters with the
 * websafe equivalents.
 *
 * The resulting string should be safe for cookies and as URL parameters.
 *
 * @param string value
 * @return string
 */
const valueEncoder = (value) => {
  // Safely perform encoding of multibyte values into a byte string
  const safeString = encodeURIComponent(value)
                    .replace(
                      /%([0-9A-F]{2})/g,
                      (_, matchedByte) => { return String.fromCharCode('0x' + matchedByte) }
                    );

  // Convert the byte string to base64, and then in turn to websafe base64
  return btoa(safeString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

try {
  detectRuntimeConfig();
  setupBrowserIdentity();
  setupSessionIdentity();
  reportPageView();
  registerUnloadHandler();
  recordPerformanceMetrics();
} catch(error) {
  errorHandler(error);
}

// Need to be careful to have a loop if I pass this to the error handler and
// the issue was triggered by the error handler (such as the remote server
// being unavailable).
const globalErrorHandler = (err) => {
  console.error(err);
}

// Apparently only available in chrome and opera
// Oh boy: https://blog.bugsnag.com/js-stacktraces/
window.addEventListener('error', globalErrorHandler);
