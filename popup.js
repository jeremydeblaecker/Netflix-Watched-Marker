const DEFAULT_SETTINGS = { enabled: true, watchedThreshold: 0.9, showProgressBar: true, hideWatched: false };
const els = {
  watchedCount: document.getElementById("watchedCount"), inProgressCount: document.getElementById("inProgressCount"),
  toggleEnabled: document.getElementById("toggleEnabled"), toggleProgressBar: document.getElementById("toggleProgressBar"),
  toggleHideWatched: document.getElementById("toggleHideWatched"), thresholdRange: document.getElementById("thresholdRange"),
  thresholdValue: document.getElementById("thresholdValue"), clearHistory: document.getElementById("clearHistory"),
  markCurrentWatched: document.getElementById("markCurrentWatched")
};
async function refreshStats() { const { watchedItems = {} } = await browser.storage.local.get("watchedItems"); const items=Object.values(watchedItems); els.watchedCount.textContent=items.filter(i=>i.watched).length; els.inProgressCount.textContent=items.filter(i=>!i.watched&&i.progress>0.03).length; }
async function loadSettings() { const { settings = {} }=await browser.storage.local.get("settings"); const merged={...DEFAULT_SETTINGS,...settings}; els.toggleEnabled.checked=merged.enabled; els.toggleProgressBar.checked=merged.showProgressBar; els.toggleHideWatched.checked=merged.hideWatched; els.thresholdRange.value=Math.round(merged.watchedThreshold*100); els.thresholdValue.textContent=`${Math.round(merged.watchedThreshold*100)}%`; }
async function saveSettings(patch) { const { settings = {} }=await browser.storage.local.get("settings"); await browser.storage.local.set({settings:{...DEFAULT_SETTINGS,...settings,...patch}}); await browser.runtime.sendMessage({type:"REFRESH_ACTIVE_TAB"}); }
function extractContentId(rawUrl) { try { const url=new URL(rawUrl); const path=url.pathname.replace(/\/+$/,"")||"/"; const watch = path.match(/\/watch\/(\d+)/i);
    if (watch) return `netflix:${watch[1]}`;
    const title = path.match(/\/title\/(\d+)/i);
    if (title) return `netflix:${title[1]}`;
    const id = url.searchParams.get("jbv") || url.searchParams.get("trackId");
    if (id && /^\d+$/.test(id)) return `netflix:${id}`; return `path:${url.hostname}${path}`; } catch { return `raw:${rawUrl}`; } }
function isPlatformUrl(rawUrl) { try { const host=new URL(rawUrl).hostname; return host === "netflix.com" || host.endsWith(".netflix.com"); } catch { return false; } }
els.toggleEnabled.addEventListener("change",()=>saveSettings({enabled:els.toggleEnabled.checked}));
els.toggleProgressBar.addEventListener("change",()=>saveSettings({showProgressBar:els.toggleProgressBar.checked}));
els.toggleHideWatched.addEventListener("change",()=>saveSettings({hideWatched:els.toggleHideWatched.checked}));
els.thresholdRange.addEventListener("input",()=>{els.thresholdValue.textContent=`${els.thresholdRange.value}%`;});
els.thresholdRange.addEventListener("change",()=>saveSettings({watchedThreshold:Number(els.thresholdRange.value)/100}));
els.clearHistory.addEventListener("click",async()=>{ if(!confirm("Effacer tout l’historique des programmes vus et en cours ?"))return; await browser.storage.local.set({watchedItems:{}}); await refreshStats(); await browser.runtime.sendMessage({type:"REFRESH_ACTIVE_TAB"}); });
els.markCurrentWatched.addEventListener("click",async()=>{ const [tab]=await browser.tabs.query({active:true,currentWindow:true}); if(!tab?.url||!isPlatformUrl(tab.url)){alert("Ouvrez d’abord une page Netflix dans cet onglet.");return;} const id=extractContentId(tab.url); const {watchedItems={}}=await browser.storage.local.get("watchedItems"); watchedItems[id]={...(watchedItems[id]||{}),watched:true,progress:1,title:tab.title||"",url:tab.url,updatedAt:Date.now()}; await browser.storage.local.set({watchedItems}); await refreshStats(); await browser.runtime.sendMessage({type:"REFRESH_ACTIVE_TAB"}); els.markCurrentWatched.textContent="Marqué ✓"; setTimeout(()=>{els.markCurrentWatched.textContent="Marquer l’onglet actif comme « vu »";},2200); });
loadSettings(); refreshStats();


// Export de migration vers Streaming Watched Manager v2.
const MIGRATION_PLATFORM = "netflix";
function migrationNormalizeId(rawKey, item = {}) {
  const raw = String(item.id || rawKey || "");
  return raw.replace(/^(?:netflix|disney|disneyplus|prime|primevideo|canal|canalplus):/i, "") || raw;
}
function migrationProgress(value, watched) {
  const n = Number(value);
  if (watched) return 100;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}
function migrationStatus(item, progress) {
  if (item?.watched === true || progress >= 90) return "watched";
  if (progress > 0) return "progress";
  return "unseen";
}
function migrationAdd(items, rawKey, item = {}, type = "content") {
  const id = migrationNormalizeId(rawKey, item);
  if (!id) return;
  const progress = migrationProgress(item.progress, item.watched);
  const key = `${MIGRATION_PLATFORM}:${id}`;
  const converted = {
    platform: MIGRATION_PLATFORM,
    id,
    type: item.type || type,
    title: item.title || item.name || item.label || id,
    url: item.url || "",
    progress,
    status: migrationStatus(item, progress),
    createdAt: Number(item.createdAt) || Number(item.updatedAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now(),
    migratedFrom: browser.runtime.id
  };
  const existing = items[key];
  if (!existing || converted.updatedAt >= existing.updatedAt) items[key] = converted;
}
async function exportForStreamingManager() {
  const status = document.getElementById("migrationStatus");
  try {
    const data = await browser.storage.local.get(["watchedItems", "seriesWatched", "settings"]);
    const items = {};
    for (const [key, item] of Object.entries(data.watchedItems || {})) migrationAdd(items, key, item, "content");
    for (const [key, item] of Object.entries(data.seriesWatched || {})) migrationAdd(items, key, {...item, title: item.title || `Série ${key}`}, "series");
    const oldSettings = data.settings || {};
    const thresholdRaw = Number(oldSettings.watchedThreshold);
    const watchedThreshold = Number.isFinite(thresholdRaw) ? Math.round(thresholdRaw <= 1 ? thresholdRaw * 100 : thresholdRaw) : 90;
    const state = {
      schemaVersion: 2,
      updatedAt: Date.now(),
      settings: {
        watchedThreshold: Math.max(50, Math.min(100, watchedThreshold)),
        hideWatched: oldSettings.hideWatched === true,
        showProgress: oldSettings.showProgressBar !== false,
        showButtons: true,
        showLabels: true
      },
      items
    };
    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      migration: {sourcePlatform: MIGRATION_PLATFORM, sourceExtensionId: browser.runtime.id},
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${MIGRATION_PLATFORM}-migration-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (status) status.textContent = `${Object.keys(items).length} contenu(s) exporté(s).`;
  } catch (error) {
    console.error("Erreur d’export de migration", error);
    if (status) status.textContent = "Échec de l’export. Consulte la console.";
  }
}
const exportForSwmButton = document.getElementById("exportForSwm");
if (exportForSwmButton) exportForSwmButton.addEventListener("click", exportForStreamingManager);


const openSiteImportButton = document.getElementById("openSiteImport");
if (openSiteImportButton) {
  openSiteImportButton.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("import.html") });
  });
}
