/**
 * VoicePanel.js: the Voice tab — an AI voiceover that reads the captions.
 *
 * A creator picks one of a few voices, hears each say the demo's own first
 * sentence (a sample is their words, not a stock line, because how a voice
 * sounds on "Open your settings and head to Billing" is the question), and
 * applies one. The voiceover is made on the server (backend services/studio/
 * voice.js) from the captions as they are, and then plays with the picture in
 * the preview and in the export. It speaks the captions, so without captions
 * there is nothing to do here but go and make some.
 *
 * ── THE ACTION IS ON THE CARD THAT WAS CHOSEN ────────────────────────────────
 * "Apply" used to sit under the whole list and the samples line, below the
 * fold of the inspector: a creator picked Kore, saw nothing happen, and had to
 * scroll to find out what to do next. It now opens inside the chosen voice's
 * own card, the voiceover's progress plays there, and once that voice is the
 * one in use the card simply says so and the button is gone.
 *
 * ── NO CAPTIONS YET: THE VOICE TAB MAKES THEM, IT DOES NOT SEND YOU AWAY ─────
 * It used to say "Add captions first" and send the creator to the Captions
 * tab to work out the rest. Now "Generate voice-over" opens a small dialog
 * that says captions come first and offers the two ways to make them (from
 * the video, from the voice where there is one; not by hand, which is the
 * Captions tab's job). It shows the work while it runs and closes itself the
 * moment captions exist, which leaves the voices on screen with the chosen
 * one's Apply button already open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Panel, Empty, Icon, Toggle } from "./ui";
import { VOICES, DEFAULT_VOICE, voiceById, voiceSig, voiceDiff, sampleText } from "./voices.mjs";
import { voiceBehindText } from "./VoiceSync";
import { voiceSample } from "./studioApi";

/**
 * Samples heard in this page, by voice and sentence: kept outside the panel so
 * switching tabs and back does not ask again. The server keeps every sample
 * for good (backend voice.js voiceSampleUrl), so after a reload a sample is
 * one quick request for its link and never a second call to the voice model.
 * A link is reused for a few hours, well inside the time it is signed for.
 */
const HEARD = new Map();
const HEARD_MS = 4 * 3600 * 1000;
function heardUrl(key) {
  const hit = HEARD.get(key);
  if (hit && Date.now() - hit.at < HEARD_MS) return hit.url;
  HEARD.delete(key);
  return "";
}

export default function VoicePanel({
  tl, edit, demo, voicing, onApply, onCaptionsFromVideo, onCaptionsFromVoice, captioning = false, hasAudio = false,
}) {
  const cues = useMemo(() => tl.cues || [], [tl.cues]);
  const vo = demo?.voiceover || null;
  const [pick, setPick] = useState(vo?.name || DEFAULT_VOICE);
  useEffect(() => {
    if (vo?.name) setPick(vo.name);
  }, [vo?.name]);

  const text = useMemo(() => sampleText(cues), [cues]);
  const setVoice = (fields, label) => edit({ voice: { ...(tl.voice || {}), ...fields } }, label);
  const on = !!tl.voice?.on;
  // Made from captions that have changed since: the words or the places.
  const stale = !!vo && voiceSig(vo.name, cues) !== vo.sig;
  const behind = useMemo(() => (stale ? voiceDiff(vo, cues) : null), [stale, vo, cues]);
  const busy = !!voicing && !voicing.failed;

  /* ── Samples ─────────────────────────────────────────────────────────── */
  const [playing, setPlaying] = useState(null);
  const [loading, setLoading] = useState(null);
  const [sampleError, setSampleError] = useState("");
  // The voice last asked for, so its progress shows on its own card.
  const [making, setMaking] = useState(null);
  // The "captions come first" dialog, and which way the captions are being made.
  const [asking, setAsking] = useState(false);
  const [captionsFrom, setCaptionsFrom] = useState(null);
  const audio = useRef(null);
  useEffect(() => () => audio.current?.pause(), []);

  const play = async (id) => {
    if (playing === id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    setPlaying(null);
    setSampleError("");
    const key = `${id}|${text}`;
    let url = heardUrl(key);
    if (!url) {
      setLoading(id);
      try {
        url = await voiceSample(demo.id, id, text);
        HEARD.set(key, { url, at: Date.now() });
      } catch (err) {
        setSampleError(err?.response?.data?.message || "That voice didn't answer. Try again in a moment.");
        return;
      } finally {
        setLoading(null);
      }
    }
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => setPlaying((p) => (p === id ? null : p));
    // A link that has expired (a tab left open past its lifetime) is forgotten,
    // so the next press asks the server, which still has the sample kept.
    a.onerror = () => {
      HEARD.delete(key);
      setPlaying((p) => (p === id ? null : p));
    };
    setPlaying(id);
    a.play().catch(() => setPlaying(null));
  };

  if (!cues.length) {
    return (
      <Panel title="Voice">
        <Empty
          icon="mic"
          title="Generate voice-over"
          action={
            <Btn size="s" kind="primary" icon={<Icon name="mic" size={13} />} onClick={() => setAsking(true)}>
              Generate voice-over
            </Btn>
          }
        >
          The AI voiceover reads your captions aloud, so it needs captions to read. Write them from your voice, from the
          script, or by hand.
        </Empty>
        {asking && (
          <CaptionsFirst
            hasScript={(tl.narration || []).length > 0}
            hasAudio={hasAudio}
            busy={captioning ? captionsFrom || "video" : null}
            onVideo={() => {
              setCaptionsFrom("video");
              onCaptionsFromVideo?.();
            }}
            onVoice={() => {
              setCaptionsFrom("voice");
              onCaptionsFromVoice?.();
            }}
            onClose={() => setAsking(false)}
          />
        )}
      </Panel>
    );
  }

  // What the chosen voice still needs: nothing once it is the voice in use,
  // reading the captions as they are now.
  const needs = !vo || vo.name !== pick || !on ? "apply" : stale ? "update" : null;
  // The card the voiceover in progress belongs to.
  const makingId = busy ? making || pick : null;
  const apply = (id) => {
    setMaking(id);
    onApply(id);
  };

  const actionFor = (v) => {
    if (busy) {
      if (v.id !== makingId) return null;
      return (
        <div role="status" aria-live="polite" style={{ display: "grid", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 620, color: "var(--ink)" }}>
            <span className="st-spin" aria-hidden="true" />
            Making the voiceover…{voicing.progress > 0 ? ` ${Math.round(voicing.progress * 100)}%` : ""}
          </div>
          <div className="st-bar">
            <i style={{ width: `${Math.max(4, Math.round((voicing.progress || 0) * 100))}%` }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.5 }}>
            Usually a minute or two.
          </div>
        </div>
      );
    }
    if (v.id !== pick || !needs) return null;
    return (
      <>
        <Btn kind="primary" full icon={<Icon name="mic" size={14} />} onClick={() => apply(v.id)}>
          {needs === "update" ? "Update the voiceover" : `Apply ${v.label}`}
        </Btn>
        {voicing?.failed && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--bad)" }}>
            {voicing.message || "We couldn't make the voiceover. Try again."}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <Panel title="Voice">
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", marginTop: -4 }}>
          Choose a voice to read your captions. Play one to hear it say your first line.
        </div>

        <div role="radiogroup" aria-label="Voice" style={{ display: "grid", gap: 8 }}>
          {VOICES.map((v) => (
            <VoiceRow
              key={v.id}
              voice={v}
              selected={pick === v.id}
              inUse={vo?.name === v.id && on}
              playing={playing === v.id}
              loading={loading === v.id}
              waiting={!!loading && loading !== v.id}
              onSelect={() => setPick(v.id)}
              onPlay={() => play(v.id)}
            >
              {actionFor(v)}
            </VoiceRow>
          ))}
        </div>
        {text && (
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)" }}>
            Samples say: “{text}”
          </div>
        )}
        {sampleError && <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--bad)" }}>{sampleError}</div>}
      </Panel>

      {vo && (
        <Panel title="Voiceover">
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-body)" }}>
            <b style={{ color: "var(--ink)" }}>{voiceById(vo.name)?.label || vo.name}</b> reads your captions,{" "}
            {vo.sentences?.length || 0} sentence{vo.sentences?.length === 1 ? "" : "s"}.
          </div>
          {stale && !busy && (
            <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-mute)" }}>
                {voiceBehindText(behind || { lines: 0 })}
              </div>
              {pick !== vo.name && (
                <Btn size="s" icon={<Icon name="mic" size={13} />} onClick={() => apply(vo.name)}>
                  Update the voiceover
                </Btn>
              )}
            </div>
          )}
          <Toggle
            label="Play the voiceover"
            hint="With the picture, in the preview and in the export."
            checked={on}
            onChange={(v) => setVoice({ on: v }, v ? "Voiceover on" : "Voiceover off")}
          />
          <Toggle
            label="Keep the recording's own sound"
            hint="Off: the voiceover plays instead of it."
            checked={!!tl.voice?.keep_original}
            disabled={!on}
            onChange={(v) => setVoice({ keep_original: v }, "Recording sound")}
          />
        </Panel>
      )}
    </>
  );
}

/**
 * One voice: chosen by clicking the row, heard with its own button. `children`
 * is what the chosen voice still needs (Apply, or the voiceover's progress),
 * opened under the row so it is where the choice was made.
 */
function VoiceRow({ voice, selected, inUse, playing, loading, waiting, onSelect, onPlay, children }) {
  return (
    <div
      style={{
        borderRadius: 12, padding: "10px 10px 10px 12px",
        border: `1.5px solid ${selected ? "var(--ink)" : "var(--line)"}`,
        background: selected ? "var(--card)" : "transparent",
        transition: "border-color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={onSelect}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, padding: 0, border: 0,
            background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${selected ? "var(--ink)" : "var(--line-strong, #C9C6C0)"}`,
              display: "grid", placeItems: "center",
            }}
          >
            {selected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ink)" }} />}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}>
              {voice.label}
              {inUse && (
                <span style={{ fontSize: 10.5, fontWeight: 650, padding: "1px 7px", borderRadius: 99, background: "rgba(116,221,176,.18)", color: "var(--ok)" }}>
                  In use
                </span>
              )}
            </span>
            <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "var(--ink-mute)" }}>{voice.sub}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onPlay}
          disabled={waiting}
          aria-label={playing ? `Stop ${voice.label}` : `Play a sample of ${voice.label}`}
          title={playing ? "Stop" : "Play a sample"}
          style={{
            width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%",
            border: "1px solid var(--line)", background: playing ? "var(--ink)" : "var(--card)",
            color: playing ? "#fff" : "var(--ink)", cursor: waiting ? "default" : "pointer", opacity: waiting ? 0.45 : 1,
            transition: "background var(--dur-hover) var(--ease-out)",
          }}
        >
          {loading ? <span className="st-spin" aria-hidden="true" /> : <Icon name={playing ? "stop" : "play"} size={13} />}
        </button>
      </div>
      {children && <div className="st-voice-act">{children}</div>}
    </div>
  );
}

/**
 * "Captions come first": the two ways to make them, from the Voice tab.
 * `busy` is "video" or "voice" while captions are being made; the dialog goes
 * away by itself when they exist, because the panel that owns it is replaced.
 */
function CaptionsFirst({ hasScript, hasAudio, busy, onVideo, onVoice, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const hint = { margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink-mute)" };

  return createPortal(
    <div
      className="st-ask hg-fade"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="st-cf-title" className="st-ask-card st-cf hg-sheet-up">
        <button type="button" className="st-cf-close" onClick={onClose} disabled={!!busy} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
        <span className="st-ask-icon">
          <Icon name="caption" size={22} />
        </span>
        <h2 id="st-cf-title">Captions come first</h2>
        <p>The voice-over reads your captions aloud. Generate them, then pick a voice.</p>

        {busy ? (
          <div role="status" aria-live="polite" className="st-cf-busy">
            <span className="st-spin" aria-hidden="true" />
            {busy === "voice" ? "Writing captions from your voice…" : "Generating captions from the video…"}
          </div>
        ) : (
          <div className="st-cf-actions">
            <Btn kind="primary" full icon={<Icon name="caption" size={14} />} onClick={onVideo} disabled={!hasScript}>
              Generate captions from the video
            </Btn>
            <p style={hint}>
              {hasScript
                ? "Understands the video and its flow, and generates captions that fit it."
                : "Available once the automatic edit has run."}
            </p>
            <Btn full icon={<Icon name="sound" size={14} />} onClick={onVoice} disabled={!hasAudio}>
              Write captions from voice
            </Btn>
            {!hasAudio && <p style={hint}>This recording has no sound.</p>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
