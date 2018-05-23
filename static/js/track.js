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
 * - Want to detect DNT, otherwise we'll want to know if cookies are
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
