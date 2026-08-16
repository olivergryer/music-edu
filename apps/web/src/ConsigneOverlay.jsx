// ─── Consigne d'arrivée sur une activité (overlay) ────────────────────────────
// Box modale affichée au lancement d'une activité : consigne synthétique +
// avertissement contextuel (son / micro) + case « ne plus afficher » (par activité).
// Le web ne peut pas outrepasser le mode silencieux/DND/volume (contrôlé par l'OS) :
// on avertit + on déverrouille l'audio au geste utilisateur (côté appelant).

import { useState } from "react";

export const CONSIGNE_VERSION = "2"; // incrémenter force le réaffichage partout

const keyFor = (storageKey) => `consigne-v${CONSIGNE_VERSION}-${storageKey}`;

export function consigneSeen(storageKey) {
  try { return localStorage.getItem(keyFor(storageKey)) === "1"; } catch { return false; }
}

export default function ConsigneOverlay({
  storageKey,
  title,
  icon,
  lines = [],
  demo,              // ReactNode — démonstration animée, insérée entre les lignes et les contrôles
  controls = [],     // [{ icon: ReactNode, name, desc }] — boutons de l'exercice à détailler
  warning,           // { tone: "sound" | "mic", text } | undefined
  startLabel = "Commencer",
  onStart,
  onClose,
}) {
  const [dontShow, setDontShow] = useState(false);

  const start = () => {
    if (dontShow) { try { localStorage.setItem(keyFor(storageKey), "1"); } catch (_) {} }
    onStart?.();
  };

  const warnColor = warning?.tone === "mic" ? "#fbbf24" : "#34d399";

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 301, width: "min(340px, 92vw)", maxHeight: "88vh", overflowY: "auto",
          background: "var(--surface)", border: "1.5px solid rgba(74,108,247,0.3)", borderRadius: 20,
          padding: "26px 22px 20px", textAlign: "center",
        }}
      >
        {icon && <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 6 }}>{icon}</div>}
        <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", marginBottom: 12 }}>{title}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, textAlign: "left" }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-muted)" }}>{l}</div>
          ))}
        </div>

        {demo && <div style={{ marginBottom: 16 }}>{demo}</div>}

        {controls.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, textAlign: "left" }}>
            {controls.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  flexShrink: 0, width: 30, height: 28, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--surface-2)", border: "1px solid var(--border-c)", fontSize: 13,
                }}>{c.icon}</span>
                <span style={{ fontSize: 12, lineHeight: 1.4 }}>
                  <b style={{ color: "var(--text)" }}>{c.name}</b>
                  <span style={{ color: "var(--text-muted)" }}> — {c.desc}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {warning && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, textAlign: "left",
              fontSize: 12, fontWeight: 600, lineHeight: 1.35,
              background: `${warnColor}1a`, border: `1px solid ${warnColor}`, color: warnColor,
              borderRadius: 12, padding: "10px 12px", marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{warning.tone === "mic" ? "🎤" : "🔊"}</span>
            <span>{warning.text}</span>
          </div>
        )}

        <button
          onClick={start}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#4A6CF7,#8B5CF6)", color: "#fff",
            fontSize: 15, fontWeight: 800, cursor: "pointer",
          }}
        >
          {startLabel}
        </button>

        <label
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginTop: 14, fontSize: 12, color: "#6b7280", cursor: "pointer", minHeight: 24,
          }}
        >
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#4A6CF7" }}
          />
          Ne plus afficher cette consigne
        </label>
      </div>
    </>
  );
}
