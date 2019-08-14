There is a 'largest contentful paint' event that happens and seems like it
would be good to track. There is sample code [on this article][1] that doesn't
appear to have a license. I should use it as a reference but re-implement it
myself. Reproduced here just in case as a reference:

```
// Create a variable to hold the latest LCP value (since it can change).
let lcp;

// Create the PerformanceObserver instance.
const po = new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const lastEntry = entries[entries.length - 1];

  // Update `lcp` to the latest value, using `renderTime` if it's available,
  // otherwise using `loadTime`. (Note: `renderTime` may not be available if
  // the element is an image and it's loaded cross-origin without the
  // `Timing-Allow-Origin` header.)
  lcp = lastEntry.renderTime || lastEntry.loadTime;
});

// Observe entries of type `largest-contentful-paint`, including buffered
// entries, i.e. entries that occurred before calling `observe()`.
po.observe({type: 'largest-contentful-paint', buffered: true});

// Send the latest LCP value to your analytics server once the user
// leaves the tab.
addEventListener('visibilitychange', function fn() {
  if (lcp && document.visibilityState === 'hidden') {
    sendToAnalytics({'largest-contentful-paint': lcp});
    removeEventListener('visibilitychange', fn, true);
  }
}, true);
```

[1]: https://web.dev/largest-contentful-paint/
