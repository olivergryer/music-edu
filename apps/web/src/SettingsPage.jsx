import { useState } from "react";
import RythmStaff from "./RythmStaff";

function FormulaCard({ formula, selected, onToggle }) {
  const timeSig = formula.group === "ternary" ? "12/8" : "4/4";
  return (
    <div
      role="button"
      onClick={() => onToggle(formula.id)}
      className="rounded-xl border-2 transition-all duration-150 select-none cursor-pointer pb-0 p-1.5"
      style={{
        borderColor: selected ? "#4A6CF7" : "var(--border-c)",
        background: selected ? "#0f1e4a" : "var(--surface)",
        opacity: selected ? 1 : 0.5,
      }}
    >
      <div className="text-[9px] font-bold text-center mb-0.5 tracking-tight" style={{ color: selected ? "#4A6CF7" : "var(--text-muted)" }}>
        {formula.name}
      </div>
      <RythmStaff
        figures={formula.figs}
        timeSig={timeSig}
        activeIdx={-1}
        width={220}
        height={90}
        showClef={false}
        showTimeSig={false}
        compact={true}
      />
    </div>
  );
}

function SheetSourceSection({ sheetId, sheetStatus, sheetError, onSheetLoad, onSheetReset }) {
  const [inputVal, setInputVal] = useState(sheetId ?? "");
  const [copied, setCopied] = useState(false);
  const shareUrl = sheetStatus === "loaded" && sheetId
    ? `${window.location.origin}${window.location.pathname}?sheet=${encodeURIComponent(sheetId)}`
    : null;
  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) });
  };
  const statusEl = {
    idle:    <span className="text-app-muted">● Données par défaut</span>,
    loading: <span className="text-yellow-400">⟳ Chargement…</span>,
    loaded:  <span className="text-success">✓ Sheet chargé</span>,
    error:   <span className="text-red-400">✕ {sheetError}</span>,
  }[sheetStatus] ?? null;

  return (
    <div className="w-full max-w-xl mb-5 bg-surface border border-app rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold text-app-muted uppercase tracking-widest mb-2.5">Source des formules</div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSheetLoad(inputVal)}
          placeholder="URL publiée ou ID Google Sheet"
          className="flex-1 bg-(--input-bg) border border-app rounded-lg px-2.5 py-1.5 text-app text-xs outline-none"
        />
        <button
          onClick={() => onSheetLoad(inputVal)}
          disabled={sheetStatus === "loading"}
          className="rounded-lg px-3.5 py-1.5 text-white text-xs font-bold border-none flex-shrink-0 disabled:opacity-50"
          style={{ background: '#4A6CF7' }}
        >
          Charger
        </button>
      </div>
      <div className="text-[10px] mb-2">{statusEl}</div>

      {shareUrl && (
        <div className="mb-2 p-2.5 bg-app border border-app rounded-lg">
          <div className="text-[9px] text-app-muted mb-1">Lien de partage (URL encodée)</div>
          <div className="flex gap-1.5 items-center">
            <div className="flex-1 text-[9px] text-app-muted break-all leading-snug">{shareUrl}</div>
            <button
              onClick={copyShareUrl}
              className="rounded border-none px-2.5 py-1 text-[10px] font-bold flex-shrink-0"
              style={{ background: copied ? '#064e3b' : 'var(--surface-2)', color: copied ? '#22C55E' : 'var(--text-muted)' }}
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {sheetStatus !== "idle" && (
        <button
          onClick={() => { setInputVal(""); onSheetReset(); }}
          className="bg-transparent border border-app rounded-lg px-3 py-1 text-app-muted text-[10px] font-semibold mb-2 block"
          style={{ minHeight: 'auto' }}
        >
          ↺ Réinitialiser (formules par défaut)
        </button>
      )}
      <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
        <div className="text-[9px] text-app-muted leading-relaxed">Publier le sheet : Fichier → Partager → Publier sur le web → CSV</div>
        <a
          href="/formules-rythme-template.csv"
          download="formules-rythme-template.csv"
          className="bg-surface-2 border border-app rounded-lg px-3 py-1 text-app-muted text-[10px] font-semibold no-underline flex-shrink-0 whitespace-nowrap"
        >
          ↓ Télécharger le modèle CSV
        </a>
      </div>
    </div>
  );
}

export default function SettingsPage({
  formulaCatalog, levelOrder, levelFormulaIds,
  selectedFormulas, onToggle, onLevelSelect, onClose,
  sheetId, sheetStatus, sheetError, onSheetLoad, onSheetReset,
  flashOffsetMs, onFlashOffsetChange,
  revealBeat, onRevealBeatChange,
  activity, tempoMode, onTempoModeChange,
  bpmFixed, onBpmFixedChange, bpmMin, onBpmMinChange, bpmMax, onBpmMaxChange,
}) {
  const binaryFormulas  = formulaCatalog.filter(f => f.group === "binary");
  const ternaryFormulas = formulaCatalog.filter(f => f.group === "ternary");

  function isLevelActive(level) {
    const cumIds = [];
    for (const lv of levelOrder) {
      (levelFormulaIds[lv] ?? []).forEach(id => cumIds.push(id));
      if (lv === level) break;
    }
    return cumIds.length > 0 && cumIds.every(id => selectedFormulas.has(id));
  }

  const selectedCount = selectedFormulas.size;
  const sectionCls = "w-full max-w-xl mb-5 bg-surface border border-app rounded-xl px-4 py-3";
  const labelCls = "text-[10px] font-bold text-app-muted uppercase tracking-widest mb-2.5 block";

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-8 overflow-y-auto">

      {/* Header */}
      <div className="w-full max-w-xl flex items-center gap-2.5 mb-5">
        <button onClick={onClose} className="bg-surface border border-app rounded-xl px-3.5 py-1.5 font-bold text-sm text-app">
          ← Retour
        </button>
        <div className="flex-1 text-base font-bold text-app">Réglages</div>
        <div className="text-xs text-app-muted">{selectedCount} formule{selectedCount !== 1 ? "s" : ""}</div>
      </div>

      {/* Tempo */}
      {onTempoModeChange && (
        <div className={sectionCls}>
          <span className={labelCls}>Tempo</span>
          <div className="flex items-center gap-2" style={{ marginBottom: tempoMode === "range" ? 10 : 0 }}>
            <div className="flex gap-1 flex-shrink-0">
              {["fixed", "range"].map(mode => (
                <button key={mode} onClick={() => onTempoModeChange(mode)}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold border-none cursor-pointer"
                  style={{ background: tempoMode === mode ? '#4A6CF7' : 'var(--surface-2)', color: tempoMode === mode ? '#fff' : 'var(--text-muted)' }}
                >
                  {mode === "fixed" ? "Fixe" : "Variable"}
                </button>
              ))}
            </div>
            {tempoMode === "fixed" && (
              <>
                <div className="flex-1">
                  <input type="range" min={50} max={220} step={2} value={bpmFixed}
                    onChange={e => onBpmFixedChange(+e.target.value)}
                    className="w-full block" style={{ accentColor: "#4A6CF7" }}
                  />
                </div>
                <div className="text-xs font-bold flex-shrink-0 min-w-14 text-right" style={{ color: '#4A6CF7' }}>{bpmFixed} BPM</div>
              </>
            )}
          </div>
          {tempoMode === "range" && (
            <div className="flex flex-col gap-1.5">
              {[{ label: "Min", val: bpmMin, set: onBpmMinChange }, { label: "Max", val: bpmMax, set: onBpmMaxChange }].map(({ label, val, set }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="text-[10px] text-app-muted flex-shrink-0 min-w-9">{label}</div>
                  <input type="range" min={50} max={220} step={2} value={val}
                    onChange={e => set(+e.target.value)} className="flex-1" style={{ accentColor: "#4A6CF7" }}
                  />
                  <div className="text-xs font-bold flex-shrink-0 min-w-14 text-right" style={{ color: '#4A6CF7' }}>{val} BPM</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Source sheet */}
      <SheetSourceSection sheetId={sheetId} sheetStatus={sheetStatus} sheetError={sheetError} onSheetLoad={onSheetLoad} onSheetReset={onSheetReset} />

      {/* Niveaux */}
      <div className={sectionCls}>
        <span className={labelCls}>Sélection par niveau</span>
        <div className="flex flex-wrap gap-1.5">
          {levelOrder.map(level => {
            const active = isLevelActive(level);
            const hasFormulas = (levelFormulaIds[level] ?? []).length > 0;
            return (
              <button
                key={level}
                onClick={() => onLevelSelect(level)}
                disabled={!hasFormulas}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold border-none transition-all duration-150"
                style={{
                  background: active ? '#4A6CF7' : hasFormulas ? 'var(--surface-2)' : 'var(--surface-2)',
                  color: active ? '#fff' : hasFormulas ? 'var(--text-muted)' : 'var(--border-c)',
                  cursor: hasFormulas ? 'pointer' : 'default',
                  boxShadow: active ? '0 0 10px rgba(74,108,247,0.4)' : 'none',
                }}
              >{level}</button>
            );
          })}
        </div>
        <div className="text-[10px] text-app-muted mt-2">Cliquer sur un niveau sélectionne toutes les formules jusqu'à ce niveau.</div>
      </div>

      {/* Reveal beat (activité 1) */}
      {activity === 1 && onRevealBeatChange && (
        <div className={sectionCls}>
          <span className={labelCls}>Voir le rythme au temps…</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(beat => (
              <button key={beat} onClick={() => onRevealBeatChange(beat)}
                className="flex-1 py-1.5 rounded-xl text-xs font-bold border-none cursor-pointer"
                style={{ background: revealBeat === beat ? '#4A6CF7' : 'var(--surface-2)', color: revealBeat === beat ? '#fff' : 'var(--text-muted)' }}
              >
                {beat}
                <div className="text-[9px] font-normal mt-0.5" style={{ color: revealBeat === beat ? '#ddd8fe' : 'var(--text-muted)' }}>
                  {beat === 1 ? "pas de bonus" : beat === 2 ? "+10%" : beat === 3 ? "+20%" : "+50%"}
                </div>
              </button>
            ))}
          </div>
          <div className="text-[9px] text-app-muted mt-1.5 leading-relaxed">Plus tard vous révélez le rythme, plus le bonus de score est élevé.</div>
        </div>
      )}

      {/* Formules binaires */}
      <div className="w-full max-w-xl mb-4">
        <span className={labelCls}>Formules binaires</span>
        <div className="grid grid-cols-2 gap-2">
          {binaryFormulas.map(f => (
            <FormulaCard key={f.id} formula={f} selected={selectedFormulas.has(f.id)} onToggle={onToggle} />
          ))}
        </div>
      </div>

      {/* Formules ternaires */}
      <div className="w-full max-w-xl mb-4">
        <span className={labelCls}>Formules ternaires</span>
        <div className="grid grid-cols-2 gap-2">
          {ternaryFormulas.map(f => (
            <FormulaCard key={f.id} formula={f} selected={selectedFormulas.has(f.id)} onToggle={onToggle} />
          ))}
        </div>
      </div>

      {/* Offset flash */}
      {onFlashOffsetChange && (
        <div className={sectionCls}>
          <span className={labelCls}>Synchronisation bordure</span>
          <div className="flex items-center gap-2.5">
            <div className="flex-1">
              <input type="range" min={-200} max={200} step={5} value={flashOffsetMs}
                onChange={e => onFlashOffsetChange(+e.target.value)}
                className="w-full block" style={{ accentColor: "#4A6CF7" }}
              />
            </div>
            <div className="text-xs font-bold flex-shrink-0 min-w-14 text-right" style={{ color: '#4A6CF7' }}>{flashOffsetMs} ms</div>
          </div>
          <div className="text-[9px] text-app-muted mt-1.5 leading-relaxed">Ajuste l'avance du flash de bordure par rapport aux beats. Négatif = plus tôt.</div>
        </div>
      )}

      {/* Bouton retour bas */}
      <button
        onClick={onClose}
        className="mt-2 w-full max-w-xl py-4 rounded-2xl border-none cursor-pointer text-base font-bold text-white"
        style={{ background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', boxShadow: '0 8px 32px rgba(74,108,247,0.3)' }}
      >
        ✓ Valider ({selectedCount} formule{selectedCount !== 1 ? "s" : ""})
      </button>
    </div>
  );
}
