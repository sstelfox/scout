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

// Collected information that determines runtime behavior including identities
let runtimeInfo = {
  cookiesSupported: null,
  dntDetected: null,
  useSecureCookie: null,
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
  const cookieRegex = new RegExp('^' + name + '=(.+)$');
  const matchingCookies = document.cookie.split(';').filter((item) => { return item.trim().match(cookieRegex); });

  // No cookie was found
  if (matchingCookies.length === 0) { return null; }

  // Can there be more than one result? Some quick Googling says it might be a
  // problem... hmmm.
  return matchingCookies[0].split('=')[1].trim();
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
  document.cookie = name + '=' + value +
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

  // TODO: If that isn't working I need to test the actual cookie support but I
  // don't have that written yet sooooo....
  return;
}

detectRuntimeConfig();

console.log(getCookie('bloop'));
setCookie('bloop', 'some random value');
console.log(getCookie('bloop'));
deleteCookie('bloop');
console.log(getCookie('bloop'));
