const DEFAULT_SETTINGS = {
  enabled: true,
  watchedThreshold: 0.9,
  showProgressBar: true,
  hideWatched: false
};

browser.runtime.onInstalled.addListener(async () => {
  const data = await browser.storage.local.get(["settings", "watchedItems", "seriesWatched"]);
  const patch = {};
  if (!data.settings) patch.settings = DEFAULT_SETTINGS;
  if (!data.watchedItems) patch.watchedItems = {};
  if (!data.seriesWatched) patch.seriesWatched = {};
  if (Object.keys(patch).length > 0) await browser.storage.local.set(patch);
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== "REFRESH_ACTIVE_TAB") return;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: "REFRESH_MARKERS" });
    } catch {
      // L’onglet actif n’est peut-être pas une page Netflix.
    }
  }
});
