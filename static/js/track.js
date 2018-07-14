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
 * - Maybe eventually send data over websockets and fallback on the POST
 *   request?
 * - It would be nice to collect performance metrics on the tracking requests
 *   as well, but currently this always triggers recurring requests and isn't
 *   ideal. Maybe have a flag for data queue that doesn't trigger the
 *   background interval.
 *
 * I generally want to limit this to three requests, the initial page request,
 * the end of page view, and the details in the middle. None should block the
 * browser though.
 */

const config = {
  cookieBrowserIDName: 'b',
  cookieBrowserExpiration: (60 * 60 * 24 * 10),
  cookiePrefix: '@s_',
  cookieSessionIDName: 's',
  cookieSessionExpiration: (60 * 60 * 2),
  cookieTestName: 'chk',

  // Send queued data at most once every 30 seconds, this should allow the
  // initial burst of collected data to be collected and sent in a single
  // request. If I ever add additional interaction tracking, this will also
  // limit those bursts.
  dataReportInterval: 30,

  errorEndPoint: 'http://127.0.0.1:9292/t/1/err',
  trackingEndPoint: 'http://127.0.0.1:9292/t/1/ana',
}

const ANALYTIC_TYPE = {
  VIEW_START: 0,
  VIEW_END: 1,
  VIEW_PERFORMANCE: 2,
}

// Collected information that determines runtime behavior including identities
let runtimeInfo = {
  // TODO: Looks like the clock has to be recreated each time or it will
  // continue to reuse the same timestamp
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

  // The browser doesn't support sendBeacon
  if (!navigator.sendBeacon) { return; }

  navigator.sendBeacon(config.errorEndPoint, JSON.stringify({ msg: error.message, stack: error.stack, }));
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
  // The browser doesn't support sendBeacon
  if (!navigator.sendBeacon) { return; }

  // We don't have any data to send
  if (runtimeInfo.dataQueue.length === 0) { return; }

  /**
   * While the cookie does include this information there are two problems with
   * relying on it. The first is that the analytics server isn't guaranteed to
   * be on the same domain or a subdomain of the domain being tracked.
   *
   * The second issue is that the view count is being used to associate the
   * different reported requests and if the user opens multiple pages the
   * cookie will update its view count and all metrics will be associated with
   * the new page not the page that is currently being viewed.
   *
   * Ultimately this is a difference of ~50 bytes/request which isn't that big
   * of a deal...
   */
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

  console.log(dataPkt);
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
  const perfEntry = JSON.parse(JSON.stringify(entry));

  // Don't record performance metrics on the analytics endpoints. Without this
  // we'll receive an analytics request every interval only reporting the
  // performance of the analytics endpoint.
  if (perfEntry.entryType === 'resource' &&
        (perfEntry.name === config.errorEndPoint || perfEntry.name == config.trackingEndPoint)) {
    return;
  }

  queueData({
    ts: runtimeInfo.clock.getTime(),
    type: ANALYTIC_TYPE.VIEW_PERFORMANCE,
    perfEntry: perfEntry,
  });
};

/**
 *  Generate a random numeric value that will be used as a unique identifier.
 *
 *  Ideally this would be encoded in radix 64 without the CRC, but the
 *  additional server complexity and the additional code in this script would
 *  remove any network transfer benefits that may be gained. I could still use
 *  radix 32 and may do so in the future, but I'm avoiding the complexity
 *  involved for now.
 *
 *  This will be used for identifiers and should be more than enough to
 *  uniquely identify browsers and sessions. This uniqueness should be based on
 *  the number of unique visitors a website is expected to have during the
 *  duration of the cookieBrowserExpiration.
 *
 *  I roughly want the chance of a collision to be about the same as winning
 *  the lottery (roughly 1 in 13.9 million) for my roughly 1000 unique visitors
 *  every 10 days (duration of cookieBrowserExpiration), which requires the
 *  estimation to be roughly 1 in 13.9 billion.
 *
 *  log(13,900,000,000) / log(2) = 33.694 bits
 *
 *  So I need 34 bit values to guarantee the random uniqueness I require.
 *
 *  @return number
 */
const randomId = () => {
  return Math.floor(Math.random() * Math.pow(2, 34));
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
    type: ANALYTIC_TYPE.VIEW_START,
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
    type: ANALYTIC_TYPE.VIEW_END,
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
