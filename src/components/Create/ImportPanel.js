import { useState, useMemo, useCallback } from "react";
import api, { errorMessage } from "../../api";
import ScriptPanel from "../Order/ScriptPanel";
import SourceCard from "./SourceCard";
import Field, { Column, Heading } from "./Field";

/**
 * Import: a script from material the creator already has.
 *
 * ── WHAT THIS SCREEN IS FOR ──────────────────────────────────────────────────
 * Discover answers "what should I cover today" out of a ranked feed. It is a
 * good answer on a busy news day in a category we collect, and no answer at all
 * the rest of the time: the story broke in a language we do not source, or it is
 * their own product launch, or a client sent a brief, or they simply watched
 * something and want to cover it. Every one of those is a creator who opened
 * the app ready to work and found nothing to work on.
 *
 * ── TWO STEPS, AND TWO PRICES ────────────────────────────────────────────────
 * Paste, then read, then order. The read step exists because pasting five links
 * is not the same as having five readable articles: publishers block crawlers
 * constantly, and the difference decides whether the script is any good. Doing
 * it first means the creator sees "read 3 of 5, the FT blocked us" and decides
 * with that in hand. See backend routes/source.js.
 *
 * Reading used to be free here and folded into the script's price, so the same
 * 60-second script cost 30 credits from Discover and 54 from an Import. It is
 * its own purchase now, priced live as the form is filled in and paid at the
 * button that does the reading. The order panel underneath is then the same
 * ScriptOrder the news feed uses, at exactly the same prices.
 */
export default function ImportPanel({ voice, onVoiceChange, onGoTranscribe, compact, limits }) {
  const maxLinks = limits?.max_links ?? 5;
  const maxText = limits?.max_text_chars ?? 6000;
  const maxVideoMin = Math.round((limits?.max_video_seconds ?? 600) / 60);

  // ── THE ONE PRICE ON THIS SCREEN ──────────────────────────────────────────
  // Only for the help text under the video field. Nothing else here costs
  // anything, and the TOTAL is never assembled in the browser: it comes from
  // the quote behind the write button on the next step, so a rate change in
  // creditPricing.js reaches both without a new bundle. See routes/source.js.
  const videoBlockSecs = limits?.video_block_seconds ?? 30;
  const videoBlockCr = limits?.video_block_credits ?? 10;

  const [youtube, setYoutube] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [links, setLinks] = useState([]);
  const [text, setText] = useState("");

  const [source, setSource] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  /**
   * What has been given, as one string.
   *
   * ── WHY A PREPARED SOURCE HAS TO GO STALE ────────────────────────────────
   * The order panel prices the material it was handed. Editing a field after
   * reading would leave a price, and a script, attached to something the
   * creator has since changed: they add a sixth link, press a button still
   * showing the old total, and get a script written without it. Comparing the
   * current inputs against the ones we actually read is what makes that
   * impossible rather than merely unlikely.
   */
  const inputsKey = useMemo(
    () => JSON.stringify([youtube.trim(), links, text.trim()]),
    [youtube, links, text]
  );
  const [readKey, setReadKey] = useState("");
  const ready = source && readKey === inputsKey;

  const hasAnything = !!(youtube.trim() || links.length || text.trim());


  const addLink = useCallback(() => {
    const v = linkDraft.trim();
    if (!v || links.length >= maxLinks) return;
    // Deduped here as well as on the server: pasting the same article twice is
    // an easy mistake and it would silently spend one of five slots.
    if (!links.includes(v)) setLinks((l) => [...l, v]);
    setLinkDraft("");
  }, [linkDraft, links, maxLinks]);

  async function read() {
    if (!hasAnything || reading) return;
    setReading(true);
    setError("");
    try {
      // Anything sitting unsubmitted in the link box is clearly meant to be
      // included. Losing it because they pressed the main button instead of
      // Add would be the product being pedantic about its own form.
      const pending = linkDraft.trim();
      const all = pending && !links.includes(pending) ? [...links, pending] : links;
      if (pending) { setLinks(all); setLinkDraft(""); }

      const { data } = await api.post("/source/preview", {
        kind: "import",
        youtube: youtube.trim(),
        links: all,
        text: text.trim(),
      });
      setSource(data.source);
      setReadKey(JSON.stringify([youtube.trim(), all, text.trim()]));
    } catch (err) {
      setSource(null);
      setError(errorMessage(err, "Couldn't read that. Check the link and try again."));
    } finally {
      setReading(false);
    }
  }

  return (
    <Column compact={compact}>
      <Heading
        title="Import"
        blurb={`Bring your own material. A YouTube video up to ${maxVideoMin} minutes, up to ${maxLinks} article links, or paste the text straight in. We read it, then write it in your voice.`}
        compact={compact}
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {/* ── The form, hidden once there is something to order ────────────────
          Collapsing it is what keeps this screen from becoming a wall. Once the
          material is read, the decision in front of the creator is how long and
          how much, and eight input fields above that are just noise they have
          already finished with. Change brings them back. */}
      {ready ? (
        <div style={{ marginBottom: 4 }}>
          <SourceCard
            source={source}
            compact={compact}
            onChange={() => { setSource(null); setReadKey(""); }}
          />
        </div>
      ) : (
        <>
          <Field
            label="YouTube video"
            hint={`Optional. Public videos up to ${maxVideoMin} minutes. Reading one adds ${videoBlockCr} credits per ${videoBlockSecs}s to the script price.`}
          >
            <input
              type="url"
              inputMode="url"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              style={inputStyle}
            />
          </Field>

          <Field
            label="Article links"
            hint={`Optional. Up to ${maxLinks}, free. Paywalled pages usually can't be read.`}
          >
            {links.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                {links.map((url) => (
                  <div
                    key={url}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", borderRadius: 9,
                      border: "1px solid var(--line)", background: "var(--card)",
                    }}
                  >
                    <span
                      style={{
                        flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink-body)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {url}
                    </span>
                    <button
                      onClick={() => setLinks((l) => l.filter((u) => u !== url))}
                      aria-label={`Remove ${url}`}
                      className="hg-btn-ghost"
                      style={{
                        flexShrink: 0, fontSize: 15, lineHeight: 1, padding: "3px 8px",
                        borderRadius: 7, border: "1px solid var(--line)",
                        background: "var(--card)", color: "var(--ink-mute)", cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {links.length < maxLinks && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="url"
                  inputMode="url"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  // Enter adds rather than submitting: on a phone the keyboard's
                  // Go key is the natural way to add a second link.
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                  placeholder="https://…"
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                <button
                  onClick={addLink}
                  disabled={!linkDraft.trim()}
                  className="hg-btn-ghost"
                  style={{
                    flexShrink: 0, fontSize: 13.5, fontWeight: 600, padding: "0 16px",
                    borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)",
                    color: linkDraft.trim() ? "var(--ink)" : "var(--ink-mute)",
                    cursor: linkDraft.trim() ? "pointer" : "default",
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </Field>

          <Field
            label="Or paste the text"
            hint="A press release, your own notes, a transcript, anything the video should be about. Free, however much you paste."
            count={`${text.length.toLocaleString()} / ${maxText.toLocaleString()}`}
            over={text.length > maxText}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, maxText))}
              placeholder="Paste here…"
              rows={compact ? 6 : 8}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, minHeight: 120 }}
            />
          </Field>

          <button
            onClick={read}
            disabled={!hasAnything || reading}
            className={hasAnything && !reading ? "hg-btn-primary" : undefined}
            style={{
              fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
              border: hasAnything ? "none" : "1px solid #DCDCDC",
              background: hasAnything ? "var(--primary)" : "#EDEDED",
              color: hasAnything ? "#fff" : "#5F5F5F",
              cursor: hasAnything && !reading ? "pointer" : "default",
              opacity: reading ? 0.55 : 1,
            }}
          >
            {reading ? "Reading…" : "Read my source"}
          </button>

          {/* Said before the button, not after. Reading costs nothing and that
              is the reason to press it; a creator watching a balance needs to
              know that before they commit, not as reassurance afterwards. The
              one thing that does carry a price is named, because a ten minute
              video is a large number to meet for the first time on the next
              screen. */}
          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
            Reading is free. Only the script is charged, by length, plus
            {" "}{videoBlockCr} credits per {videoBlockSecs}s if you added a video.
          </p>
        </>
      )}

      {ready && (
        <ScriptPanel
          sourceId={source.id}
          voice={voice}
          onVoiceChange={onVoiceChange}
          onGoTranscribe={onGoTranscribe}
          compact={compact}
          writingNote={
            source.youtube && !source.youtube.already_read
              ? "Watching the video, then drafting. This one takes a minute or two."
              : "Reading your material, then drafting. Around half a minute."
          }
        />
      )}
    </Column>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 14.5,
  fontFamily: "inherit",
  color: "var(--ink)",
  padding: "11px 13px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--card)",
  outline: "none",
};
