/**
 * LaunchPage.js: product demos generated from a website address.
 *
 *   LaunchNew        the form: a URL, optional notes, today's allowance
 *   LaunchVideoPage  one generated video at /app/studio/gen-<slug>: progress
 *                    while it is made, then the player, its versions, a
 *                    download, and the chat that asks for the next version
 *   GeneratedCards   the library's row of generated videos
 *
 * ── THERE IS NO EDITOR HERE, ON PURPOSE ──────────────────────────────────────
 * The product is the finished video. A change is asked for in words and comes
 * back as a new version, so every earlier version stays one click away and
 * nothing a creator does here can leave the video half-edited.
 *
 * ── THE PAGE CAN BE LEFT ─────────────────────────────────────────────────────
 * A first cut takes about five minutes and runs on the server, so the page
 * only polls while something is being made, and a reload or a return later
 * lands on the same video in whatever state it reached.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listLaunch, createLaunch, getLaunch, refineLaunch, retryLaunch, launchDownload } from "./launchApi";
import { Btn, Icon, Badge } from "./ui";
import { fmtTime } from "./model";

const POLL_MS = 2500;
const errorOf = (err, fallback) => err?.response?.data?.message || fallback;

const INPUT = {
  width: "100%", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, padding: "12px 14px", borderRadius: 12,
  background: "var(--card)", border: "1px solid var(--line-strong)", color: "var(--ink)", outline: "none",
};
const focusRing = {
  onFocus: (e) => { e.target.style.borderColor = "var(--ink)"; },
  onBlur: (e) => { e.target.style.borderColor = "var(--line-strong)"; },
};

/* ────────────────────────────────────────────────────────────────────────────
   The form
   ──────────────────────────────────────────────────────────────────────────── */

export function LaunchNew({ onCreated, onCancel }) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    listLaunch().then(setInfo).catch(() => setInfo({ available: true, limits: null }));
  }, []);

  const left = info?.limits?.videos_left;
  const blocked = info && (info.available === false || left === 0);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await createLaunch(url.trim(), notes.trim());
      onCreated(res.video.id);
    } catch (err) {
      setError(errorOf(err, "We couldn't start that. Please try again."));
      setBusy(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
      <Btn kind="quiet" size="s" icon={<Icon name="back" size={13} />} onClick={onCancel} style={{ marginLeft: -10 }}>
        Demo Studio
      </Btn>
      <h1 style={{ margin: "14px 0 0", fontSize: 25, fontWeight: 720, letterSpacing: "-0.035em", color: "var(--ink)" }}>
        Generate a product demo
      </h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--ink-mute)" }}>
        Paste your website. We read it, take real screenshots, write the script, record a voiceover and add music: a
        finished launch video in about five minutes, with nothing to record.
      </p>

      <form onSubmit={submit} style={{ marginTop: 26, display: "grid", gap: 16 }}>
        <div>
          <label htmlFor="lv-url" style={{ display: "block", marginBottom: 7, fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>
            Website
          </label>
          <input
            id="lv-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoFocus
            placeholder="yourproduct.com"
            value={url}
            maxLength={500}
            onChange={(e) => setUrl(e.target.value)}
            style={INPUT}
            {...focusRing}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-mute)" }}>
            A public page: your homepage or a product page. Pages behind a login can't be read.
          </div>
        </div>
        <div>
          <label htmlFor="lv-notes" style={{ display: "block", marginBottom: 7, fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>
            Anything to focus on? <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>Optional</span>
          </label>
          <textarea
            id="lv-notes"
            rows={2}
            placeholder="e.g. aimed at small agencies; show the pricing; keep it under 40 seconds"
            value={notes}
            maxLength={600}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...INPUT, fontSize: 14, resize: "vertical" }}
            {...focusRing}
          />
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--bad)" }}>
            {error}
          </p>
        )}
        {info?.available === false && (
          <p role="status" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--bad)" }}>
            Generating demos isn't available right now. Please try again later.
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Btn kind="primary" size="l" icon={<Icon name="sparkle" size={14} />} disabled={busy || !url.trim() || blocked} onClick={submit}>
            {busy ? "Starting…" : "Generate demo"}
          </Btn>
          {info?.limits && !info.limits.admin && (
            <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
              {left > 0
                ? `${left} of ${info.limits.daily_videos} left today · free during beta`
                : "You've used today's demos. More tomorrow."}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   One generated video
   ──────────────────────────────────────────────────────────────────────────── */

const STEPS = ["Reading your website", "Writing the script", "Recording the voiceover", "Rendering the video"];
const IDEAS = ["Make it shorter", "Make the hook punchier", "Use a light theme", "Use a female voice", "Calmer music", "Focus more on pricing"];

export function LaunchVideoPage({ id, onExit }) {
  const [video, setVideo] = useState(null);
  const [limits, setLimits] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [shown, setShown] = useState(0); // the version in the player; 0 = the latest
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const seenVersions = useRef(0);
  const chatEnd = useRef(null);

  const apply = useCallback((res) => {
    setVideo(res.video);
    if (res.limits) setLimits(res.limits);
    setLoadError("");
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await getLaunch(id));
    } catch (err) {
      setLoadError(errorOf(err, "We couldn't load this video."));
    }
  }, [id, apply]);

  useEffect(() => {
    load();
  }, [load]);

  const busy = video?.status === "queued" || video?.status === "running";
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [busy, load]);

  // A new version arriving takes the player over; picking an older one by hand holds until then.
  const versions = useMemo(() => video?.versions || [], [video]);
  useEffect(() => {
    if (versions.length > seenVersions.current) {
      seenVersions.current = versions.length;
      setShown(0);
    }
  }, [versions.length]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [video?.chat?.length, busy]);

  const current = shown ? versions.find((v) => v.v === shown) : versions[versions.length - 1];

  const send = async (text) => {
    const t = String(text ?? message).trim();
    if (!t || sending || busy) return;
    setSending(true);
    setSendError("");
    try {
      apply(await refineLaunch(id, t));
      setMessage("");
    } catch (err) {
      setSendError(errorOf(err, "That couldn't be sent. Please try again."));
    }
    setSending(false);
  };

  const retry = async () => {
    setSendError("");
    try {
      apply(await retryLaunch(id));
    } catch (err) {
      setSendError(errorOf(err, "We couldn't start it again. Please try later."));
    }
  };

  const download = async () => {
    if (!current || downloading) return;
    setDownloading(true);
    try {
      const href = await launchDownload(id, current.v);
      const a = document.createElement("a");
      a.href = href;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setSendError(errorOf(err, "The download couldn't start. Please try again."));
    }
    setDownloading(false);
  };

  if (loadError && !video) {
    return (
      <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
        <Btn kind="quiet" size="s" icon={<Icon name="back" size={13} />} onClick={onExit} style={{ marginLeft: -10 }}>
          Demo Studio
        </Btn>
        <p role="alert" style={{ marginTop: 20, fontSize: 14, color: "var(--bad)" }}>
          {loadError}
        </p>
      </div>
    );
  }

  const refining = busy && video?.pending?.kind === "refine";
  const failedFirst = video?.status === "failed" && !versions.length;
  const changesLeft = limits?.changes_left;
  const canAsk = !!versions.length && !busy && !sending && changesLeft !== 0;

  return (
    <div style={{ width: "100%", maxWidth: 1220, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Btn kind="quiet" size="s" icon={<Icon name="back" size={13} />} onClick={onExit} style={{ marginLeft: -10 }}>
            Demo Studio
          </Btn>
          <h1 style={{ margin: "10px 0 0", fontSize: 23, fontWeight: 720, letterSpacing: "-0.03em", color: "var(--ink)", overflowWrap: "anywhere" }}>
            {video ? video.title : " "}
          </h1>
          {video && (
            <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 4, fontSize: 12.5, color: "var(--ink-mute)", textDecoration: "none" }}>
              {video.domain} ↗
            </a>
          )}
        </div>
        {current && (
          <Btn kind="primary" icon={<Icon name="download" size={14} />} onClick={download} disabled={downloading} style={{ marginTop: 34 }}>
            {downloading ? "Preparing…" : `Download v${current.v}`}
          </Btn>
        )}
      </header>

      <div className="lv-grid">
        <section aria-label="Video">
          <div className="lv-stage">
            {current ? (
              <video key={current.url} src={current.url} poster={video?.thumb_url || undefined} controls playsInline preload="metadata" style={{ width: "100%", height: "100%", display: "block", background: "#000" }} />
            ) : failedFirst ? (
              <div className="lv-center">
                <div style={{ maxWidth: 420, textAlign: "center" }}>
                  <Icon name="alert" size={22} style={{ color: "var(--bad)" }} />
                  <p style={{ margin: "10px 0 16px", fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)" }}>{video.error || "This video couldn't be made."}</p>
                  <Btn kind="primary" onClick={retry}>Try again</Btn>
                </div>
              </div>
            ) : (
              <Making video={video} steps={STEPS} />
            )}
          </div>

          {versions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {versions.map((v) => {
                const on = current?.v === v.v;
                return (
                  <button
                    key={v.v}
                    type="button"
                    onClick={() => setShown(v.v === versions[versions.length - 1].v ? 0 : v.v)}
                    title={v.request || "First cut"}
                    style={{
                      fontFamily: "inherit", fontSize: 12.5, fontWeight: 650, padding: "6px 11px", borderRadius: 99, cursor: "pointer",
                      border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, background: on ? "var(--ink)" : "var(--card)",
                      color: on ? "#fff" : "var(--ink-body)", fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    v{v.v} · {fmtTime(v.seconds)}
                  </button>
                );
              })}
              {refining && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-mute)" }}>
                  <span className="lv-dot" /> Making v{versions.length + 1}… {Math.round((video.progress || 0) * 100)}%
                </span>
              )}
            </div>
          )}
        </section>

        <aside className="lv-chat" aria-label="Ask for changes">
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="chat" size={14} />
            <span style={{ fontSize: 13.5, fontWeight: 680, color: "var(--ink)" }}>Ask for changes</span>
            <Badge>Beta</Badge>
          </div>

          <div className="lv-msgs st-scroll">
            {(video?.chat || []).map((m, i) => (
              <div key={i} className={m.role === "user" ? "lv-msg lv-msg--me" : `lv-msg${m.failed ? " lv-msg--bad" : ""}`}>
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="lv-msg lv-msg--work">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="lv-dot" />
                  <span>{video.stage || "Starting"}…</span>
                </div>
                <div className="st-bar" style={{ marginTop: 9 }}>
                  <i style={{ width: `${Math.round((video.progress || 0) * 100)}%` }} />
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          {versions.length > 0 && !busy && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px 0" }}>
              {IDEAS.map((idea) => (
                <button key={idea} type="button" className="lv-idea" onClick={() => setMessage(idea)} disabled={!canAsk}>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            style={{ padding: 14, display: "grid", gap: 8 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                rows={2}
                value={message}
                maxLength={600}
                disabled={!versions.length || changesLeft === 0}
                placeholder={!versions.length ? "Once your video is ready, ask for changes here." : busy ? "Wait for this version to finish…" : "e.g. make it 30 seconds and calmer"}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                style={{ ...INPUT, fontSize: 13.5, padding: "9px 11px", borderRadius: 10, resize: "none", flex: 1 }}
                {...focusRing}
              />
              <Btn kind="primary" icon={<Icon name="send" size={14} />} disabled={!canAsk || !message.trim()} onClick={() => send()} aria-label="Send" style={{ minHeight: 44 }} />
            </div>
            {sendError && (
              <p role="alert" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--bad)" }}>
                {sendError}
              </p>
            )}
            {limits && !limits.admin && versions.length > 0 && (
              <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>
                {changesLeft > 0 ? `${changesLeft} changes left today · free during beta` : "You've used today's changes. More tomorrow."}
              </span>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}

/** The stage while the first cut is made: where it is, and that the page can be left. */
function Making({ video, steps }) {
  const at = Math.max(0, steps.indexOf((video?.stage || "").replace(/…$/, "")));
  const pct = Math.round((video?.progress || 0) * 100);
  return (
    <div className="lv-center">
      <div style={{ width: "min(420px, 90%)" }}>
        <div style={{ fontSize: 16, fontWeight: 680, letterSpacing: "-0.02em", color: "var(--ink)" }}>
          {video?.status === "queued" ? "Waiting to start…" : `${video?.stage || "Starting"}…`}
        </div>
        <div className="st-bar" style={{ marginTop: 12 }}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "grid", gap: 8 }}>
          {steps.map((s, i) => {
            const done = video?.status === "running" && i < at;
            const now = video?.status === "running" && i === at;
            return (
              <li key={s} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: done || now ? "var(--ink)" : "var(--ink-mute)" }}>
                <span style={{ width: 18, display: "inline-grid", placeItems: "center" }}>
                  {done ? <Icon name="check" size={13} /> : now ? <span className="lv-dot" /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--line-strong)" }} />}
                </span>
                {s}
              </li>
            );
          })}
        </ol>
        <p style={{ margin: "18px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-mute)" }}>
          This takes about five minutes. You can leave this page: it keeps going, and the video will be here when you
          come back.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The library row
   ──────────────────────────────────────────────────────────────────────────── */

export function GeneratedCards({ videos, grid, onOpen, onDelete }) {
  if (!videos?.length) return null;
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
        Generated demos
      </h2>
      <div style={grid}>
        {videos.map((v) => (
          <div key={v.id} style={{ position: "relative" }}>
            <button type="button" className="st-card" onClick={() => onOpen(v)}>
              <div className="st-card-shot" style={{ backgroundImage: v.thumb_url ? `url(${v.thumb_url})` : undefined }}>
                {v.busy && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,6,12,.62)" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#fff" }}>
                        {v.versions ? "Making a new version" : "Generating"}
                      </div>
                      <div className="st-bar" style={{ width: 110, marginTop: 9 }}>
                        <i style={{ width: `${Math.round((v.progress || 0) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                {!v.busy && v.seconds > 0 && (
                  <span
                    style={{
                      position: "absolute", right: 8, bottom: 8, padding: "3px 7px", borderRadius: 6,
                      background: "rgba(6,8,14,.82)", color: "#fff", fontSize: 10.5, fontWeight: 650, fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtTime(v.seconds)}
                  </span>
                )}
              </div>
              <div style={{ padding: "12px 13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.title}
                  </span>
                  {v.status === "failed" && !v.versions && <Badge tone="warn">Failed</Badge>}
                  {v.versions > 1 && <Badge>v{v.versions}</Badge>}
                </div>
                <div style={{ marginTop: 5, fontSize: 11.5, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.domain}
                </div>
              </div>
            </button>
            {!v.busy && (
              <button
                type="button"
                title="Delete"
                aria-label={`Delete ${v.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v);
                }}
                style={{
                  position: "absolute", top: 8, right: 8, width: 28, height: 28, display: "grid", placeItems: "center",
                  borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(6,8,14,.72)", color: "#fff", backdropFilter: "blur(6px)",
                }}
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

