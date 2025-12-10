const toggle = document.getElementById("toggleSwitch");
const statusText = document.getElementById("statusText");

// Initialize toggle state from storage
chrome.storage.sync.get(["podcastOnlyEnabled"], ({ podcastOnlyEnabled }) => {
  const enabled = podcastOnlyEnabled ?? true;
  toggle.classList.toggle("active", enabled);
  toggle.style.background = enabled ? "#4caf50" : "red";
  statusText.textContent = enabled ? "Filtering ON" : "Filtering OFF";
});

// Click handler
toggle.addEventListener("click", () => {
  const enabled = !toggle.classList.contains("active");
  toggle.classList.toggle("active", enabled);
  toggle.style.background = enabled ? "#4caf50" : "red";
  statusText.textContent = enabled ? "Filtering ON" : "Filtering OFF";

  // Save new state
  chrome.storage.sync.set({ podcastOnlyEnabled: enabled });

  // Refresh content.js on all YouTube tabs
  chrome.tabs.query({ url: "*://www.youtube.com/*" }, (tabs) => {
    tabs.forEach(tab => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
    });
  });
});
