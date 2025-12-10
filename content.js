console.log("[YT Podcast Only] content.js loaded");

// --------------------------------------------------------
// Load toggle state first
// --------------------------------------------------------
chrome.storage.sync.get(["podcastOnlyEnabled"], ({ podcastOnlyEnabled }) => {
  const enabled = podcastOnlyEnabled ?? true;

  if (!enabled) {
    console.log("[YT Podcast Only] Disabled by toggle");
    return;
  }

  console.log("[YT Podcast Only] Enabled");

  // --------------------------------------------------------
  // Podcast detection rules
  // --------------------------------------------------------
  const PODCAST_KEYWORDS = ["podcast", "interview", "talk", "discussion", "episode", "show"];
  const MIN_DURATION_MIN = 30; // automatic podcast
  const MEDIUM_DURATION_MIN = 20; // 20-30 min require keyword

  // --------------------------------------------------------
  // Helper: parse duration like "1:23:45", "23:45" or "45"
  // --------------------------------------------------------
  function parseDurationToMinutes(durationText) {
    if (!durationText) return null;
    durationText = durationText.trim();
    const parts = durationText.split(":").map(p => p.replace(/\D/g, "")).filter(Boolean);
    if (parts.length === 0) return null;
    let minutes = 0;
    if (parts.length === 3) {
      minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + Math.round(parseInt(parts[2], 10) / 60);
    } else if (parts.length === 2) {
      minutes = parseInt(parts[0], 10) + Math.round(parseInt(parts[1], 10) / 60);
    } else if (parts.length === 1) {
      minutes = parseInt(parts[0], 10);
      if (minutes > 60) minutes = Math.round(minutes / 60);
    }
    return Number.isFinite(minutes) ? minutes : null;
  }

  // --------------------------------------------------------
  // Helper: get video title robustly
  // --------------------------------------------------------
  function getTitleText(item) {
    const selectors = [
      '#video-title',
      'a#video-title',
      'ytd-rich-grid-media #content-text',
      'yt-formatted-string#content',
      'yt-formatted-string.title',
      'h3 a'
    ];
    for (const sel of selectors) {
      const el = item.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    }
    const text = item.innerText || item.textContent || "";
    return text.split("\n")[0] || text;
  }

  // --------------------------------------------------------
  // Helper: get duration text robustly
  // --------------------------------------------------------
  function getDurationText(item) {
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
    const maybe = item.querySelectorAll('span, yt-formatted-string, div');
    for (const el of maybe) {
      if (!el || !el.innerText) continue;
      const t = el.innerText.trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t;
    }
    return null;
  }

  // --------------------------------------------------------
  // Determine if item is podcast
  // --------------------------------------------------------
  function isPodcastItem(item) {
    const title = (getTitleText(item) || "").toLowerCase();
    const durationText = getDurationText(item);
    const minutes = parseDurationToMinutes(durationText);
    const hasKeyword = PODCAST_KEYWORDS.some(k => title.includes(k));

    if (minutes === null) return false; // no duration → not podcast
    if (minutes >= MIN_DURATION_MIN) return true; // long video → podcast
    if (minutes >= MEDIUM_DURATION_MIN && hasKeyword) return true; // medium + keyword
    return false; // otherwise not podcast
  }

  // --------------------------------------------------------
  // Feed selectors
  // --------------------------------------------------------
  const FEED_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-row ytd-rich-grid-media'
  ];

  function collectFeedItems() {
    const items = new Set();
    for (const sel of FEED_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => items.add(el));
    }
    return Array.from(items);
  }

  // --------------------------------------------------------
  // Main filter
  // --------------------------------------------------------
  function filterFeedOnce() {
    try {
      const items = collectFeedItems();
      if (!items || items.length === 0) return;
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

  // --------------------------------------------------------
  // Debounce helper
  // --------------------------------------------------------
  function debounce(fn, timeout = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), timeout);
    };
  }

  const debouncedFilter = debounce(filterFeedOnce, 250);

  // --------------------------------------------------------
  // MutationObserver
  // --------------------------------------------------------
  const observer = new MutationObserver(() => {
    debouncedFilter();
  });

  function startObserving() {
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    console.log("[YT Podcast Only] MutationObserver started");
  }

  // --------------------------------------------------------
  // Initial run
  // --------------------------------------------------------
  function waitForInitialLoadAndRun() {
    debouncedFilter();
    setTimeout(debouncedFilter, 1000);
    setTimeout(debouncedFilter, 2500);
    setTimeout(debouncedFilter, 5000);
    startObserving();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    waitForInitialLoadAndRun();
  } else {
    window.addEventListener("DOMContentLoaded", waitForInitialLoadAndRun);
    window.addEventListener("yt-navigate-finish", waitForInitialLoadAndRun);
  }

  // --------------------------------------------------------
  // Debug helpers
  // --------------------------------------------------------
  window.__ytPodcastOnly = {
    runOnce: filterFeedOnce,
    config: {
      PODCAST_KEYWORDS,
      MIN_DURATION_MIN
    }
  };

  console.log("[YT Podcast Only] ready — open DevTools Console for logs.");
});
