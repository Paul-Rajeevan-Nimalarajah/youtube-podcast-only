// -----------------------------
// YouTube Podcast-only content script (robust + debounced observer)
// -----------------------------

(function() {
  console.log("[YT Podcast Only] content.js loaded");

  // Keywords used to identify podcasts (lowercase)
  const PODCAST_KEYWORDS = ["podcast", "interview", "talk", "discussion", "episode", "show"];

  // Minimum podcast duration (in minutes) to treat as podcast automatically
  const MIN_DURATION_MIN = 30;

  // Utility: parse a duration like "1:23:45" or "23:45" into minutes (integer). Returns null if not parseable.
  function parseDurationToMinutes(durationText) {
    if (!durationText) return null;
    // remove whitespace
    durationText = durationText.trim();
    // sometimes contains non digits like '\n' or spaces
    const parts = durationText.split(":").map(p => p.replace(/\D/g, "")).filter(Boolean);
    if (parts.length === 0) return null;
    let minutes = 0;
    if (parts.length === 3) { // hh:mm:ss
      minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + Math.round(parseInt(parts[2],10)/60);
    } else if (parts.length === 2) { // mm:ss
      minutes = parseInt(parts[0], 10) + Math.round(parseInt(parts[1],10)/60);
    } else if (parts.length === 1) { // seconds or minutes
      minutes = parseInt(parts[0], 10);
      if (minutes > 60) minutes = Math.round(minutes / 60);
    }
    return Number.isFinite(minutes) ? minutes : null;
  }

  // Robustly get the title text from several possible selectors inside a video item
  function getTitleText(item) {
    const selectors = [
      '#video-title', // common
      'a#video-title',
      'ytd-rich-grid-media #content-text',
      'yt-formatted-string#content',
      'yt-formatted-string.title',
      'h3 a' // fallback
    ];
    for (const sel of selectors) {
      const el = item.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }
    // As a last resort, try to find any visible text node inside item
    const text = item.innerText || item.textContent || "";
    return text.split("\n")[0] || text;
  }

  // Get duration text if available from thumbnail overlay
  function getDurationText(item) {
    // Try common overlay selectors
    const overlaySelectors = [
      'ytd-thumbnail-overlay-time-status-renderer',
      '.ytd-thumbnail-overlay-time-status-renderer',
      '.ytp-time-duration',
      'span.ytd-thumbnail-overlay-time-status-renderer',
      'span.video-time'
    ];
    for (const sel of overlaySelectors) {
      const el = item.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 0) {
        return el.innerText.trim();
      }
    }
    // Look for any element that looks like a time (pattern like 1:23:45 or 23:45)
    const maybe = item.querySelectorAll('span, yt-formatted-string, div');
    for (const el of maybe) {
      if (!el || !el.innerText) continue;
      const t = el.innerText.trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t;
    }
    return null;
  }

  // Determine whether a given item is podcast-like
/*  function isPodcastItem(item) {
    const title = (getTitleText(item) || "").toLowerCase();
    const durationText = getDurationText(item);
    // Check keywords in title
    const hasKeyword = PODCAST_KEYWORDS.some(k => title.includes(k));
    if (hasKeyword) return true;

    // Check duration if available
    const minutes = parseDurationToMinutes(durationText);
    if (minutes !== null && minutes >= MIN_DURATION_MIN) return true;

    // If nothing matched, treat as non-podcast
    return false;
  }*/
  function isPodcastItem(item) {
  const title = (getTitleText(item) || "").toLowerCase();
  const durationText = getDurationText(item);
  const minutes = parseDurationToMinutes(durationText);

  const hasKeyword = PODCAST_KEYWORDS.some(k => title.includes(k));

  // Rule 1: No duration visible → NOT a podcast
  if (minutes === null) return false;

  // Rule 2: Very long videos are podcasts even without keyword
  if (minutes >= 30) return true;

  // Rule 3: Medium-long videos need keyword
  if (minutes >= 20 && hasKeyword) return true;

  // Everything else = not a podcast
  return false;
}


  // The list of selectors that represent items in the home feed / grid
  const FEED_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-row ytd-rich-grid-media' // extra fallback
  ];

  function collectFeedItems() {
    const items = new Set();
    for (const sel of FEED_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => items.add(el));
    }
    return Array.from(items);
  }

  // Main filter function
  function filterFeedOnce() {
    try {
      const items = collectFeedItems();
      if (!items || items.length === 0) {
        // console.debug(`[YT Podcast Only] No feed items found yet (count=0)`);
        return;
      }
      let total = 0, hidden = 0, kept = 0;
      items.forEach(item => {
        total++;
        if (isPodcastItem(item)) {
          item.classList.remove('hidden-video');
          kept++;
        } else {
          item.classList.add('hidden-video');
          hidden++;
        }
      });
      console.log(`[YT Podcast Only] processed ${total} items — kept ${kept}, hidden ${hidden}`);
    } catch (err) {
      console.error("[YT Podcast Only] filter error:", err);
    }
  }

  // Debounce helper
  function debounce(fn, timeout = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), timeout);
    };
  }

  const debouncedFilter = debounce(filterFeedOnce, 250);

  // Setup mutation observer for dynamic SPA changes
  const observer = new MutationObserver((mutations) => {
    // If YouTube changes a lot, run debounced filter to avoid thrashing
    debouncedFilter();
  });

  function startObserving() {
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    console.log("[YT Podcast Only] MutationObserver started");
  }

  // Wait until the body exists and initial feed loads
  function waitForInitialLoadAndRun() {
    // Try to run right away in case document is already ready
    debouncedFilter();

    // Try again after some delays (YouTube lazy loads)
    setTimeout(debouncedFilter, 1000);
    setTimeout(debouncedFilter, 2500);
    setTimeout(debouncedFilter, 5000);

    startObserving();
  }

  // run when DOMContentLoaded or document ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    waitForInitialLoadAndRun();
  } else {
    window.addEventListener("DOMContentLoaded", waitForInitialLoadAndRun);
    window.addEventListener("yt-navigate-finish", waitForInitialLoadAndRun);
  }

  // Expose small debug controls in window (for your devtools)
  window.__ytPodcastOnly = {
    runOnce: filterFeedOnce,
    config: {
      PODCAST_KEYWORDS,
      MIN_DURATION_MIN
    }
  };

  console.log("[YT Podcast Only] ready — open DevTools Console for logs. You can run __ytPodcastOnly.runOnce() manually.");
})();

