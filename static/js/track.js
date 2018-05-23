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
 *   - Errors in the tracking script itself
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
 * - Generate or load a session identifier and a browser identifier, if DNT is
 *   detected this will be the special value 'dnt'. If cookies are supported
 *   I'll want to save/update the respective cookie.
 * - Send initial page view information to the server
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
  cookiePrefix: '_scout_',
}

// Collected information that determines runtime behavior including identities
let runtimeInfo = {
  cookiesSupported: null,
  dntDetected: null,
  useSecureCookie: null,
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
  // TODO: Re-enable this once we're done, I don't want to muck with my DNT
  // browser settings just for testing.
  //runtimeInfo.dntDetected = (navigator.doNotTrack === '1');
  runtimeInfo.dntDetected = false;
  runtimeInfo.useSecureCookie = (location.protocol === 'https:');

  // Needs to be run after DNT detection
  runtimeInfo.cookiesSupported = testCookieSupport();
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
  const cookieRegex = new RegExp('^' + cookieName(name) + '=(.+)$');
  const matchingCookies = document.cookie.split(';').filter((item) => { return item.trim().match(cookieRegex); });

  // No cookie was found
  if (matchingCookies.length === 0) { return null; }

  // Can there be more than one result? Some quick Googling says it might be a
  // problem... hmmm.
  return valueDecoder(matchingCookies[0].split('=')[1].trim());
}

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
  setCookie('test', testVal);
  const cookieSupport = (getCookie('test') === testVal);
  deleteCookie('test');

  return cookieSupport;
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
  let safeString = encodeURIComponent(value)
                    .replace(
                      /%([0-9A-F]{2})/g,
                      (_, matchedByte) => { return String.fromCharCode('0x' + matchedByte) }
                    );

  // Convert the byte string to base64, and then in turn to websafe base64
  return btoa(safeString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

detectRuntimeConfig();

setCookie('utf8_test', 'ಬಾ ಇಲ್ಲಿ ಸಂಭವಿಸು ಇಂದೆನ್ನ ಹೃದಯದಲಿ', 30);
console.log(getCookie('utf8_test'));
