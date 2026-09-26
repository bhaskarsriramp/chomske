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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getStudioConfig, listDemos, deleteDemo, startAnalysis } from "./studioApi";
import RecordPage from "./RecordPage";
import StudioEditor from "./StudioEditor";
import Skeleton from "../Shell/Skeleton";
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
    <div className="st-root" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {notice && (
        <div
          role="status"
          style={{
            margin: bleed ? 0 : "18px 20px 0", padding: "11px 14px", borderRadius: bleed ? 0 : 11, fontSize: 12.5, lineHeight: 1.5,
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
          minHeight: 0 needs no such promise.

          ── AND WHY THE PAGES SCROLL IN HERE ─────────────────────────────
          The library and the recorder are pages, and a library with a dozen
          recordings is taller than the window. With no scroller of its own
          it overflowed the app shell and the whole DOCUMENT scrolled, taking
          the sidebar and the credits card with it. So the pages scroll here,
          vertically only, and the sidebar stays put. The editor gets no
          scroller: it fits the window and scrolls inside its own regions. */}
      <div
        className={bleed ? undefined : "st-scroll"}
        style={{
          flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column",
          ...(bleed ? null : { overflowX: "hidden", overflowY: "auto", padding: `${notice ? 14 : 18}px 20px 20px` }),
        }}
      >
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
              // Throws on failure, so the confirmation dialog can say so
              // rather than closing over a recording that is still there.
              await deleteDemo(id);
              setDemos((list) => (list || []).filter((d) => d.id !== id));
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

const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 16 };

function Library({ demos, config, onRecord, onOpen, onDelete }) {
  // The recording waiting on "are you sure", or null.
  const [doomed, setDoomed] = useState(null);

  return (
    <div style={{ width: "100%", maxWidth: 1080, margin: "0 auto" }}>
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

      {demos === null && <LibrarySkeleton />}

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
        <div style={GRID}>
          {demos.map((d) => (
            <Card key={d.id} demo={d} onOpen={() => onOpen(d.id)} onDelete={() => setDoomed(d)} />
          ))}
        </div>
      )}

      {demos?.length > 0 && (
        <p style={{ marginTop: 26, fontSize: 12, color: "var(--ink-mute)" }}>
          Recordings and their files are deleted {config?.limits?.retention_days || 7} days after you last touch them.
          Exports you have downloaded are yours to keep.
        </p>
      )}

      {doomed && (
        <ConfirmDelete
          demo={doomed}
          onCancel={() => setDoomed(null)}
          onConfirm={async () => {
            await onDelete(doomed.id);
            setDoomed(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The library before its list arrives: the same grid and the same cards, in
 * grey. It holds the page's shape so nothing jumps when the real cards land,
 * and it cannot be misread the way a blank page can, as "no recordings".
 */
function LibrarySkeleton() {
  return (
    <div role="status" aria-label="Loading your recordings" style={GRID}>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--line)", borderRadius: 15, overflow: "hidden",
            background: "var(--card)", boxShadow: "var(--shadow-xs)",
          }}
        >
          <Skeleton variant="rectangular" height="auto" style={{ aspectRatio: "16 / 9", borderRadius: 0 }} />
          <div style={{ padding: "12px 13px 14px" }}>
            <Skeleton variant="text" width="58%" height={14} />
            <Skeleton variant="text" width="44%" height={11} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// "26 Sep 2026, 3:45 pm", in the viewer's own locale and clock.
const WHEN = new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

/**
 * When the demo was last changed. `updated_at` moves on an edit, an analysis
 * or an export, and not on merely opening it, so "Edited" is true of it.
 */
function editedAt(demo) {
  const iso = demo.updated_at || demo.created_at;
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  return <time dateTime={t.toISOString()}>Edited {WHEN.format(t)}</time>;
}

/**
 * Deleting removes the recording and every export of it, and cannot be undone,
 * so it asks first. In the app's own dialog rather than window.confirm, which
 * names the website instead of the recording, cannot show which button is the
 * dangerous one, and freezes the whole tab while it waits.
 */
function ConfirmDelete({ demo, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef(null);

  // Focus starts on Cancel: pressing Enter on a dialog that has just appeared
  // must never be the answer that deletes something.
  useEffect(() => {
    const before = document.activeElement;
    cancelRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.response?.data?.message || "We couldn't delete this recording. Please try again.");
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="hg-fade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 16,
        background: "rgba(15,15,15,.45)",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="st-delete-title"
        aria-describedby="st-delete-body"
        className="hg-sheet-up"
        style={{
          width: "min(420px, 100%)", padding: 22, borderRadius: 16,
          border: "1px solid var(--line)", background: "var(--card)", boxShadow: "var(--shadow-modal)",
        }}
      >
        <h2 id="st-delete-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>
          Delete this recording?
        </h2>
        <p id="st-delete-body" style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", overflowWrap: "anywhere" }}>
          <strong style={{ fontWeight: 650, color: "var(--ink)" }}>{demo.title}</strong> and all of its exports will be
          deleted. This can't be undone.
        </p>
        {error && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--bad)" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
          <Btn ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancel
          </Btn>
          <Btn kind="destroy" onClick={confirm} disabled={busy} icon={<Icon name="trash" size={13} />}>
            {busy ? "Deleting…" : "Delete"}
          </Btn>
        </div>
      </div>
    </div>,
    document.body
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
          <div
            style={{
              marginTop: 5, fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {editedAt(demo)}
          </div>
        </div>
      </button>

      <button
        type="button"
        title="Delete"
        aria-label={`Delete ${demo.title}`}
        onClick={(e) => {
          e.stopPropagation();
          // Deleting removes gigabytes and cannot be undone, so it asks (see
          // ConfirmDelete). Every other control in the studio is reversible
          // and none of them do.
          onDelete();
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
