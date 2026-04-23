import { useState } from "react";
import RythmStaff from "./RythmStaff";

// ─── Carte d'une formule ──────────────────────────────────────────────────────
function FormulaCard({ formula, selected, onToggle }) {
  // On affiche uniquement les notes de la formule, sans rembourrage ni chiffrage
  const timeSig = formula.group === "ternary" ? "12/8" : "4/4";

  return (
    <div
      role="button"
      onClick={() => onToggle(formula.id)}
      style={{
        cursor:"pointer",
        borderRadius:12,
        border:`2px solid ${selected ? "#7c3aed" : "#1f2937"}`,
        background:selected ? "#1a0d3a" : "#0a0f1a",
        padding:"6px 6px 0",
        opacity:selected ? 1 : 0.5,
        transition:"all 0.15s",
        userSelect:"none",
      }}
    >
      <div style={{
        fontSize:9, fontWeight:700, textAlign:"center",
        color:selected ? "#c084fc" : "#4b5563",
        marginBottom:2, letterSpacing:0.3,
      }}>
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
      />
    </div>
  );
}

// ─── Section source Google Sheets ────────────────────────────────────────────
function SheetSourceSection({ sheetId, sheetStatus, sheetError, onSheetLoad, onSheetReset }) {
  const [inputVal,  setInputVal]  = useState(sheetId ?? "");
  const [copied,    setCopied]    = useState(false);

  const shareUrl = sheetStatus === "loaded" && sheetId
    ? `${window.location.origin}${window.location.pathname}?sheet=${encodeURIComponent(sheetId)}`
    : null;

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusBadge = {
    idle:    <span style={{color:"#6b7280"}}>● Données par défaut</span>,
    loading: <span style={{color:"#fbbf24"}}>⟳ Chargement…</span>,
    loaded:  <span style={{color:"#34d399"}}>✓ Sheet chargé</span>,
    error:   <span style={{color:"#f87171"}}>✕ {sheetError}</span>,
  }[sheetStatus] ?? null;

  return (
    <div style={{width:"100%",maxWidth:540,marginBottom:20,
      background:"#0a0f1a",borderRadius:14,padding:"12px 14px"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
        textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
        Source des formules
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSheetLoad(inputVal)}
          placeholder="URL publiée ou ID Google Sheet"
          style={{
            flex:1,background:"#111827",border:"1px solid #1f2937",
            borderRadius:8,padding:"6px 10px",color:"#f9fafb",fontSize:11,
            outline:"none",
          }}
        />
        <button
          onClick={() => onSheetLoad(inputVal)}
          disabled={sheetStatus === "loading"}
          style={{
            background:"#4f46e5",border:"none",borderRadius:8,
            padding:"6px 14px",color:"#fff",fontSize:11,fontWeight:700,
            cursor:"pointer",flexShrink:0,
          }}
        >
          Charger
        </button>
      </div>
      <div style={{fontSize:10,marginBottom:8}}>{statusBadge}</div>

      {shareUrl && (
        <div style={{marginBottom:8,padding:"8px 10px",background:"#0f172a",
          borderRadius:8,border:"1px solid #1e293b"}}>
          <div style={{fontSize:9,color:"#6b7280",marginBottom:4}}>
            Lien de partage (URL encodée)
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{flex:1,fontSize:9,color:"#9ca3af",
              wordBreak:"break-all",lineHeight:1.4}}>
              {shareUrl}
            </div>
            <button
              onClick={copyShareUrl}
              style={{
                background: copied ? "#065f46" : "#1f2937",
                border:"none",borderRadius:6,
                padding:"4px 10px",color: copied ? "#34d399" : "#9ca3af",
                fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0,
              }}
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {sheetStatus !== "idle" && (
        <button
          onClick={() => { setInputVal(""); onSheetReset(); }}
          style={{
            background:"none",border:"1px solid #374151",borderRadius:8,
            padding:"4px 12px",color:"#6b7280",fontSize:10,fontWeight:600,
            cursor:"pointer",marginBottom:8,display:"block",
          }}
        >
          ↺ Réinitialiser (formules par défaut)
        </button>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginTop:6,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:9,color:"#374151",lineHeight:1.5}}>
          Publier le sheet : Fichier → Partager → Publier sur le web → CSV
        </div>
        <a
          href="/formules-rythme-template.csv"
          download="formules-rythme-template.csv"
          style={{
            background:"#111827",border:"1px solid #1f2937",borderRadius:8,
            padding:"4px 12px",color:"#9ca3af",fontSize:10,fontWeight:600,
            textDecoration:"none",flexShrink:0,whiteSpace:"nowrap",
          }}
        >
          ↓ Télécharger le modèle CSV
        </a>
      </div>
    </div>
  );
}

// ─── Page réglages ────────────────────────────────────────────────────────────
export default function SettingsPage({
  formulaCatalog,
  levelOrder,
  levelFormulaIds,
  selectedFormulas,
  onToggle,
  onLevelSelect,
  onClose,
  sheetId,
  sheetStatus,
  sheetError,
  onSheetLoad,
  onSheetReset,
}) {
  const binaryFormulas  = formulaCatalog.filter(f => f.group === "binary");
  const ternaryFormulas = formulaCatalog.filter(f => f.group === "ternary");

  // Niveau actif = le plus haut niveau dont TOUTES les formules sont sélectionnées
  // (pour colorer le bouton de niveau)
  function isLevelActive(level) {
    // Toutes les formules de C1/1 jusqu'à ce niveau doivent être sélectionnées
    const cumIds = [];
    for (const lv of levelOrder) {
      (levelFormulaIds[lv] ?? []).forEach(id => cumIds.push(id));
      if (lv === level) break;
    }
    return cumIds.length > 0 && cumIds.every(id => selectedFormulas.has(id));
  }

  const selectedCount = selectedFormulas.size;

  return (
    <div style={{
      minHeight:"100dvh", background:"#030712", color:"#f9fafb",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"12px 14px 32px",
      fontFamily:"'Inter','Segoe UI',sans-serif",
      overflowY:"auto",
    }}>

      {/* ── HEADER ── */}
      <div style={{width:"100%",maxWidth:540,display:"flex",
        alignItems:"center",gap:10,marginBottom:20}}>
        <button
          onClick={onClose}
          style={{
            background:"#111827",border:"1px solid #1f2937",
            borderRadius:10,color:"#c084fc",fontWeight:700,
            fontSize:13,padding:"6px 14px",cursor:"pointer",
          }}
        >
          ← Retour
        </button>
        <div style={{flex:1,fontSize:16,fontWeight:700,color:"#c084fc"}}>
          Réglages
        </div>
        <div style={{fontSize:11,color:"#6b7280"}}>
          {selectedCount} formule{selectedCount!==1?"s":""}
        </div>
      </div>

      {/* ── SOURCE SHEET ── */}
      <SheetSourceSection
        sheetId={sheetId}
        sheetStatus={sheetStatus}
        sheetError={sheetError}
        onSheetLoad={onSheetLoad}
        onSheetReset={onSheetReset}
      />

      {/* ── NIVEAUX ── */}
      <div style={{width:"100%",maxWidth:540,marginBottom:20,
        background:"#0a0f1a",borderRadius:14,padding:"12px 14px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
          textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
          Sélection par niveau
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {levelOrder.map(level => {
            const active = isLevelActive(level);
            const hasFormulas = (levelFormulaIds[level] ?? []).length > 0;
            return (
              <button
                key={level}
                onClick={() => onLevelSelect(level)}
                disabled={!hasFormulas}
                style={{
                  padding:"5px 14px",borderRadius:999,fontSize:11,fontWeight:700,
                  cursor:hasFormulas?"pointer":"default",border:"none",
                  background:active?"#7c3aed":hasFormulas?"#1f2937":"#111827",
                  color:active?"#fff":hasFormulas?"#9ca3af":"#374151",
                  boxShadow:active?"0 0 10px rgba(124,58,237,0.4)":"none",
                  transition:"all 0.15s",
                }}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div style={{fontSize:10,color:"#4b5563",marginTop:8}}>
          Cliquer sur un niveau sélectionne toutes les formules jusqu'à ce niveau.
        </div>
      </div>

      {/* ── FORMULES BINAIRES ── */}
      <div style={{width:"100%",maxWidth:540,marginBottom:16}}>
        <div style={{
          fontSize:10,fontWeight:700,color:"#6b7280",
          textTransform:"uppercase",letterSpacing:1,marginBottom:8,
        }}>
          Formules binaires
        </div>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(2, 1fr)",
          gap:8,
        }}>
          {binaryFormulas.map(f => (
            <FormulaCard
              key={f.id}
              formula={f}
              selected={selectedFormulas.has(f.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>

      {/* ── FORMULES TERNAIRES ── */}
      <div style={{width:"100%",maxWidth:540,marginBottom:16}}>
        <div style={{
          fontSize:10,fontWeight:700,color:"#6b7280",
          textTransform:"uppercase",letterSpacing:1,marginBottom:8,
        }}>
          Formules ternaires
        </div>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(2, 1fr)",
          gap:8,
        }}>
          {ternaryFormulas.map(f => (
            <FormulaCard
              key={f.id}
              formula={f}
              selected={selectedFormulas.has(f.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>

      {/* ── BOUTON RETOUR BAS DE PAGE ── */}
      <button
        onClick={onClose}
        style={{
          marginTop:8,width:"100%",maxWidth:540,
          padding:"16px 0",
          background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
          border:"none",borderRadius:20,cursor:"pointer",
          color:"#fff",fontSize:15,fontWeight:700,
          boxShadow:"0 8px 32px rgba(109,40,217,0.4)",
        }}
      >
        ✓ Valider ({selectedCount} formule{selectedCount!==1?"s":""})
      </button>
    </div>
  );
}
