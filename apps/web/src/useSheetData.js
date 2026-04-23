import { useState, useEffect, useCallback } from "react";

const LS_KEY = "rhythmSheetId";

function levelToInt(str) {
  const m = str.match(/^C(\d)(?:\/(\d))?$/);
  if (!m) return 99;
  return parseInt(m[1]) * 10 + parseInt(m[2] ?? "0");
}

// Accepts: full published URL, regular sheet URL, or plain sheet ID
function resolveSheetUrl(input) {
  const s = input.trim();
  if (s.startsWith("http")) {
    // Use URL directly — force output=csv in case it's missing
    try {
      const u = new URL(s);
      u.searchParams.set("output", "csv");
      return u.toString();
    } catch (_) { return s; }
  }
  // Plain ID → standard export endpoint
  return `https://docs.google.com/spreadsheets/d/${s}/export?format=csv`;
}

function parseCSVRow(line) {
  const result = []; let cur = "", inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseFigs(str) {
  return str.split(",").map(s => {
    s = s.trim();
    const triplet = s.endsWith("t");
    const raw = triplet ? s.slice(0, -1) : s;
    const rest = raw.endsWith("r");
    return { dur: raw, ...(triplet && { triplet: true }), ...(rest && { rest: true }) };
  });
}

function parseSheetCSV(csvText) {
  // Filter blank lines and comment lines (starting with #)
  const lines = csvText.trim().split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  if (lines.length < 2) throw new Error("Sheet vide ou invalide");

  // lines[0] = header row, rest = data
  const rows = lines.slice(1).map(parseCSVRow);

  const formulaCatalog = rows.map(([id, name, group, beats, level, figs]) => ({
    id:    id.trim(),
    name:  name.trim(),
    group: group.trim(),
    beats: parseInt(beats),
    level: level.trim(),
    figs:  parseFigs(figs ?? ""),
  }));

  const levelOrder = [...new Set(rows.map(r => r[4]?.trim()).filter(Boolean))]
    .sort((a, b) => levelToInt(a) - levelToInt(b));

  const levelFormulaIds = {};
  levelOrder.forEach(lv => { levelFormulaIds[lv] = []; });
  formulaCatalog.forEach(f => {
    if (levelFormulaIds[f.level]) levelFormulaIds[f.level].push(f.id);
  });

  return { formulaCatalog, levelOrder, levelFormulaIds };
}

export default function useSheetData(defaultCatalog) {
  const [sheetId, setSheetIdState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("sheet") ?? localStorage.getItem(LS_KEY) ?? "";
  });
  const [status,   setStatus]   = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [catalog,  setCatalog]  = useState(defaultCatalog);

  const loadSheet = useCallback(async (raw) => {
    if (!raw) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const url = resolveSheetUrl(raw);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      const parsed = parseSheetCSV(csv);
      setCatalog(parsed);
      setStatus("loaded");
      localStorage.setItem(LS_KEY, raw.trim());
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    if (sheetId) loadSheet(sheetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSheetId = useCallback((raw) => {
    const s = raw.trim();
    setSheetIdState(s);
    loadSheet(s);
  }, [loadSheet]);

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setSheetIdState("");
    setCatalog(defaultCatalog);
    setStatus("idle");
    setErrorMsg("");
  }, [defaultCatalog]);

  return {
    ...catalog,
    sheetId,
    sheetStatus: status,
    sheetError:  errorMsg,
    setSheetId,
    resetToDefault,
  };
}
