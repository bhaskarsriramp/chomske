/**
 * StudioPage.js: the studio's own shell, and the library it opens on.
 *
 * Three destinations, and which one is showing is a piece of state rather than
 * a route, because a recording in progress must not be lost to a stray
 * navigation and a route change is the easiest way to lose one.
 *
 *   library   every recording, newest first
 *   record    the setup screen and then the capture itself
 *   edit      one demo open in the editor
 *
 * ── THE ANALYSIS IS STARTED FROM HERE ────────────────────────────────────────
 * Not from the recorder, which has already navigated away by then, and not from
 * the editor, which may be opened on a demo that was analysed days ago. The
 * page owns the one action that costs credits, so there is one place where the
 * price is confirmed and one place where a refusal is reported.
 */
import { useCallback, useEffect, useState } from "react";
import { getStudioConfig, listDemos, deleteDemo, startAnalysis } from "./studioApi";
import RecordPage from "./RecordPage";
import StudioEditor from "./StudioEditor";
import { Btn, Icon, Badge, Empty } from "./ui";
import { fmtTime } from "./model";
import "./studio.css";

export default function StudioPage() {
  const [config, setConfig] = useState(null);
  const [view, setView] = useState({ name: "library" });
  const [demos, setDemos] = useState(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      setDemos(await listDemos());
    } catch {
      setDemos([]);
    }
  }, []);

  useEffect(() => {
    getStudioConfig().then(setConfig).catch(() => setConfig(null));
    refresh();
  }, [refresh]);

  // The library goes stale while a demo is preparing or analysing somewhere
  // else. Only polled while something is actually running.
  useEffect(() => {
    if (view.name !== "library") return undefined;
    const busy = (demos || []).some((d) => ["preparing", "analysing", "uploading"].includes(d.status));
    if (!busy) return undefined;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [view.name, demos, refresh]);

  /**
   * Start the automatic edit.
   *
   * `expected_cost` is deliberately omitted: this is the first thing that
   * happens after a recording and there is no button showing a price to hold
   * the server to. The confirmation that matters — "you do not have enough
   * credits" — comes back as a 402 either way.
   */
  const analyse = useCallback(
    async (demo, opts = {}) => {
      try {
        await startAnalysis(demo.id, { captions: !!opts.captions });
        setView({ name: "edit", id: demo.id });
      } catch (err) {
        const d = err?.response?.data;
        setNotice(d?.message || "We couldn't start the edit.");
        setView({ name: "edit", id: demo.id });
      }
      refresh();
    },
    [refresh]
  );

  const opened = useCallback(
    (id, opts) => {
      refresh();
      if (opts?.autoAnalyse) analyse({ id }, opts);
      else setView({ name: "edit", id });
    },
    [analyse, refresh]
  );

  // The editor is full-bleed: its own header, stage, inspector and ruler each
  // own their edge, exactly as the script editor's workspace does. The library
  // and the recorder are pages, and pages have margins.
  const bleed = view.name === "edit";

  return (
    <div
      className="st-root"
      style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", padding: bleed ? 0 : "18px 20px 20px" }}
    >
      {notice && (
        <div
          role="status"
          style={{
            margin: bleed ? 0 : "0 0 14px", padding: "11px 14px", borderRadius: bleed ? 0 : 11, fontSize: 12.5, lineHeight: 1.5,
            border: "1px solid #F5C7C3", background: "#FCE8E6", color: "var(--bad)",
            display: "flex", gap: 10, alignItems: "center", flexShrink: 0,
          }}
        >
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer" }}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      {/* ── WHY flex AND NOT height: 100% ──────────────────────────────────
          Everything below has to fit the viewport and scroll inside itself:
          the inspector holds a voiceover script longer than any screen. A
          percentage height only resolves when every ancestor has a definite
          one, and this tree is mounted inside the dashboard's flex column
          where that is not guaranteed — so the script simply ran off the
          bottom of the window with nothing to scroll. A flex item with
          minHeight: 0 needs no such promise. */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {view.name === "record" && (
          <RecordPage config={config} onOpen={opened} onCancel={() => setView({ name: "library" })} />
        )}

        {view.name === "edit" && (
          <StudioEditor
            demoId={view.id}
            config={config}
            onExit={() => {
              setView({ name: "library" });
              refresh();
            }}
            onAnalyse={analyse}
          />
        )}

        {view.name === "library" && (
          <Library
            demos={demos}
            config={config}
            onRecord={() => setView({ name: "record" })}
            onOpen={(id) => setView({ name: "edit", id })}
            onDelete={async (id) => {
              await deleteDemo(id).catch(() => {});
              refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The library
   ──────────────────────────────────────────────────────────────────────────── */

function Library({ demos, config, onRecord, onOpen, onDelete }) {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 720, letterSpacing: "-0.035em", color: "var(--ink)" }}>
            Demo Studio
          </h1>
          <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--ink-mute)" }}>
            Record your screen. The zooms, cuts, cursor and blur are decided for you.
          </p>
        </div>
        <Btn kind="record" size="l" icon={<Icon name="record" size={14} />} onClick={onRecord}>
          New recording
        </Btn>
      </header>

      {demos === null && <div style={{ fontSize: 13, color: "var(--ink-mute)" }}>Loading…</div>}

      {demos?.length === 0 && (
        <div style={{ border: "1px dashed var(--line)", borderRadius: 18, padding: "10px 0" }}>
          <Empty
            icon="film"
            title="No recordings yet"
            action={
              <Btn kind="record" icon={<Icon name="record" size={14} />} onClick={onRecord}>
                Record your first demo
              </Btn>
            }
          >
            Click record, choose a screen or a window when your browser asks, and show your product. Everything after
            that is automatic.
          </Empty>
        </div>
      )}

      {demos?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 16 }}>
          {demos.map((d) => (
            <Card key={d.id} demo={d} onOpen={() => onOpen(d.id)} onDelete={() => onDelete(d.id)} />
          ))}
        </div>
      )}

      {demos?.length > 0 && (
        <p style={{ marginTop: 26, fontSize: 12, color: "var(--ink-mute)" }}>
          Recordings and their files are deleted {config?.limits?.retention_days || 7} days after you last touch them.
          Exports you have downloaded are yours to keep.
        </p>
      )}
    </div>
  );
}

const STATUS = {
  new: { label: "Not recorded", tone: "mute" },
  uploading: { label: "Uploading", tone: "mute" },
  preparing: { label: "Preparing", tone: "mute" },
  analysing: { label: "Editing", tone: "ai" },
  ready: { label: "", tone: "mute" },
  failed: { label: "Failed", tone: "warn" },
};

function Card({ demo, onOpen, onDelete }) {
  const status = STATUS[demo.status] || STATUS.ready;
  const busy = demo.status === "preparing" || demo.status === "analysing";

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="st-card" onClick={onOpen} disabled={demo.purged}>
        <div
          className="st-card-shot"
          style={{ backgroundImage: demo.thumb_url ? `url(${demo.thumb_url})` : undefined }}
        >
          {busy && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,6,12,.62)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink)" }}>
                  {status.label}
                </div>
                <div className="st-bar" style={{ width: 110, marginTop: 9 }}>
                  <i style={{ width: `${Math.round((demo.progress || 0) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
          {demo.purged && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,6,12,.72)", color: "#C9CAD2", fontSize: 12 }}>
              Files deleted
            </div>
          )}
          {!busy && !demo.purged && demo.output_duration > 0 && (
            <span
              style={{
                position: "absolute", right: 8, bottom: 8, padding: "3px 7px", borderRadius: 6,
                background: "rgba(6,8,14,.82)", color: "#fff", fontSize: 10.5, fontWeight: 650,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtTime(demo.output_duration)}
            </span>
          )}
        </div>

        <div style={{ padding: "12px 13px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {demo.title}
            </span>
            {demo.status === "failed" && <Badge tone="warn">Failed</Badge>}
            {demo.renders > 0 && <Badge tone="good">{demo.renders}</Badge>}
          </div>
          <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {demo.summary || new Date(demo.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </div>
        </div>
      </button>

      <button
        type="button"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          // Deleting removes gigabytes and cannot be undone, so it asks. Every
          // other control in the studio is reversible and none of them do.
          if (window.confirm(`Delete "${demo.title}"? This removes the recording and its exports.`)) onDelete();
        }}
        style={{
          position: "absolute", top: 8, right: 8, width: 28, height: 28, display: "grid", placeItems: "center",
          borderRadius: 8, border: "none", cursor: "pointer",
          background: "rgba(6,8,14,.72)", color: "#fff", backdropFilter: "blur(6px)",
        }}
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}
