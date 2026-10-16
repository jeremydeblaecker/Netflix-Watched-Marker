const PLATFORM = document.body.dataset.platform;
const PLATFORM_ALIASES = {
  canalplus: ["canalplus", "canal", "mycanal"],
  netflix: ["netflix"],
  primevideo: ["primevideo", "prime"],
  disneyplus: ["disneyplus", "disney"]
};

const chooseFile = document.getElementById("chooseFile");
const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const detailsEl = document.getElementById("details");

chooseFile.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  statusEl.className = "status";
  statusEl.textContent = "Lecture et validation du fichier…";
  detailsEl.hidden = true;
  try {
    const json = JSON.parse(await file.text());
    const parsed = parsePayload(json);
    if (!parsed.length) throw new Error(`Aucun élément ${PLATFORM} compatible trouvé dans ce fichier.`);

    const current = await browser.storage.local.get(["watchedItems", "seriesWatched"]);
    const watchedItems = { ...(current.watchedItems || {}) };
    const seriesWatched = { ...(current.seriesWatched || {}) };
    let added = 0, updated = 0;

    for (const record of parsed) {
      const target = record.type === "series" ? seriesWatched : watchedItems;
      const existing = target[record.key];
      const incoming = record.value;
      if (!existing) {
        target[record.key] = incoming;
        added++;
      } else if ((Number(incoming.updatedAt) || 0) >= (Number(existing.updatedAt) || 0)) {
        target[record.key] = { ...existing, ...incoming };
        updated++;
      }
    }

    await browser.storage.local.set({ watchedItems, seriesWatched });
    const verified = await browser.storage.local.get(["watchedItems", "seriesWatched"]);
    const missing = parsed.filter(r => !(r.key in (r.type === "series" ? (verified.seriesWatched || {}) : (verified.watchedItems || {}))));
    if (missing.length) throw new Error(`${missing.length} élément(s) n'ont pas été sauvegardés.`);

    const storedCount = Object.keys(verified.watchedItems || {}).length + Object.keys(verified.seriesWatched || {}).length;
    showCounts(parsed.length, added, updated, storedCount);
    statusEl.className = "status ok";
    statusEl.textContent = `Import terminé : ${parsed.length} élément(s) compatible(s) traité(s).`;
    try { await browser.runtime.sendMessage({ type: "REFRESH_ACTIVE_TAB" }); } catch (_) {}
  } catch (error) {
    console.error(error);
    statusEl.className = "status error";
    statusEl.textContent = `Échec de l'import : ${error.message || error}`;
  } finally {
    fileInput.value = "";
  }
});

function showCounts(read, added, updated, stored) {
  document.getElementById("readCount").textContent = read;
  document.getElementById("addedCount").textContent = added;
  document.getElementById("updatedCount").textContent = updated;
  document.getElementById("storedCount").textContent = stored;
  detailsEl.hidden = false;
}

function parsePayload(data) {
  let source = null;
  if (data?.state?.items && typeof data.state.items === "object") source = data.state.items;
  else if (data?.items && typeof data.items === "object") source = data.items;
  else if (data?.watchedItems && typeof data.watchedItems === "object") source = data.watchedItems;
  else if (data && typeof data === "object" && !Array.isArray(data)) source = data;
  else throw new Error("Format JSON non reconnu.");

  const records = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const item = rawValue && typeof rawValue === "object" ? rawValue : {};
    if (!belongsToPlatform(rawKey, item)) continue;
    const id = normalizeId(rawKey, item);
    if (!id) continue;
    const type = item.type === "series" ? "series" : "content";
    const progress = normalizeProgress(item.progress, item.watched, item.status);
    records.push({
      type,
      key: type === "series" ? normalizeSeriesKey(id) : normalizeContentKey(id),
      value: type === "series" ? {
        watched: item.watched === true || item.status === "watched" || progress >= 0.9,
        title: item.title || item.name || id,
        updatedAt: Number(item.updatedAt) || Date.now()
      } : {
        watched: item.watched === true || item.status === "watched" || progress >= 0.9,
        progress,
        title: item.title || item.name || item.label || id,
        url: item.url || "",
        createdAt: Number(item.createdAt) || Number(item.updatedAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now()
      }
    });
  }
  return deduplicate(records);
}

function belongsToPlatform(rawKey, item) {
  const declared = String(item.platform || "").toLowerCase();
  if (declared) return PLATFORM_ALIASES[PLATFORM].includes(declared);
  const prefix = String(rawKey).split(":", 1)[0].toLowerCase();
  const known = Object.values(PLATFORM_ALIASES).flat();
  return !known.includes(prefix) || PLATFORM_ALIASES[PLATFORM].includes(prefix);
}

function stripPlatformPrefix(value) {
  let text = String(value || "");
  for (const alias of Object.values(PLATFORM_ALIASES).flat()) {
    const prefix = `${alias}:`;
    if (text.toLowerCase().startsWith(prefix)) return text.slice(prefix.length);
  }
  return text;
}

function normalizeId(rawKey, item) {
  return stripPlatformPrefix(item.id || rawKey).trim();
}

function normalizeContentKey(id) {
  if (/^(?:path|raw|h|id):/i.test(id)) return normalizeSpecial(id);
  if (PLATFORM === "canalplus") return id;
  if (PLATFORM === "netflix") return `netflix:${id.replace(/^netflix:/i, "")}`;
  if (PLATFORM === "primevideo") return `prime:${id.replace(/^(?:primevideo|prime):/i, "").toUpperCase()}`;
  if (PLATFORM === "disneyplus") return `disney:${id.replace(/^(?:disneyplus|disney):/i, "").toLowerCase()}`;
  return id;
}

function normalizeSpecial(id) {
  if (PLATFORM === "primevideo" && /^path:/i.test(id)) return id;
  if (PLATFORM === "netflix" && /^path:/i.test(id)) return id;
  if (PLATFORM === "disneyplus" && /^path:/i.test(id)) return id;
  return id;
}
function normalizeSeriesKey(id) { return id.startsWith("series:") ? id : `series:${id}`; }
function normalizeProgress(value, watched, status) {
  if (watched === true || status === "watched") return 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}
function deduplicate(records) {
  const map = new Map();
  for (const record of records) {
    const k = `${record.type}:${record.key}`;
    const old = map.get(k);
    if (!old || record.value.updatedAt >= old.value.updatedAt) map.set(k, record);
  }
  return [...map.values()];
}
