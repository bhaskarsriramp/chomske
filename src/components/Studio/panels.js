/**
 * panels.js: the editor's right-hand side.
 *
 * One panel per kind of thing in the timeline. They share a shape on purpose:
 * a list of what is there, the selected one's controls underneath, and one way
 * to add another. A creator who has learned the zoom panel has learned the blur
 * panel.
 *
 * ── NOTHING HERE OWNS ANY STATE ──────────────────────────────────────────────
 * Every panel takes the timeline and an `edit` function and nothing else. The
 * editor holds the document, the undo stack and the autosave; these are only
 * ways of describing a change to it. That is what lets the same change come
 * from a panel, from a drag on the preview, from the timeline, or from applying
 * one of the reviewer's suggestions, without four code paths.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Btn, Segmented, Slider, Toggle, Field, Swatches, Panel, Row, Badge, Empty, Icon } from "./ui";
import { fmtTime, clamp, layout, mergedCuts, placedSpans, GRADIENTS, CAPTION_STYLES, CAPTION_SIZES, CAPTION_LOOKS } from "./model";
import { create } from "./create";
import { clipsOf } from "./clips";
import { applyState, coverage, blurNames } from "./follow.mjs";
import { cursorLookName, isHex, cursorSize, CURSOR_SIZE_MIN, CURSOR_SIZE_MAX, DEFAULT_CURSOR_COLOR, DEFAULT_RIPPLE_COLOR } from "./cursorLook.mjs";
// Caption colour and size are the script editor's controls, not a second set.
import { ColorPicker, SizePicker, HexInput } from "../Edit/captionStyle";

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(1)}s`;

/* ────────────────────────────────────────────────────────────────────────────
   Video
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The recording as clips, in playing order, with what was taken out between
 * them (clips.js says what a clip is).
 *
 * A clip's times are the finished video's, so they match the ruler. Deleting
 * one takes its stretch out; the last clip cannot go, because a demo with
 * nothing left in it cannot be exported. Every stretch already taken out,
 * by a deleted clip or by the automatic edit trimming the waiting, is listed
 * where it was, with Restore, which is the easiest way to get it back.
 */
export function VideoPanel({ tl, selection, onSelect, seek, onDeleteClip, onRestoreCut }) {
  const lay = useMemo(() => layout(tl), [tl]);
  const clips = useMemo(() => clipsOf(tl, lay), [tl, lay]);
  const rows = useMemo(
    () =>
      [
        ...clips.map((c) => ({ kind: "clip", at: c.src_start, c })),
        ...mergedCuts(tl).map((k) => ({ kind: "cut", at: k.start, k })),
      ].sort((a, b) => a.at - b.at),
    [clips, tl]
  );
  const only = clips.length <= 1;

  return (
    <Panel title={`Video · ${clips.length} clip${clips.length === 1 ? "" : "s"}`}>
      <div style={{ display: "grid", gap: 2, margin: -6 }}>
        {rows.map((r) =>
          r.kind === "clip" ? (
            <Row
              key={r.c.id}
              accent="#8A8F98"
              selected={selection?.kind === "clip" && selection.id === r.c.id}
              onClick={() => {
                onSelect({ kind: "clip", id: r.c.id });
                seek(r.c.out_start + 0.05);
              }}
              onRemove={only ? undefined : () => onDeleteClip(r.c)}
              title={`Clip ${r.c.n}`}
              sub={`${fmtTime(r.c.out_start, true)} – ${fmtTime(r.c.out_end, true)} · ${secs(r.c.out_end - r.c.out_start)}`}
            />
          ) : (
            <div key={`cut${r.k.start}`} className="st-cutrow">
              <Icon name="scissors" size={12} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {secs(r.k.end - r.k.start)} taken out{r.k.auto ? " automatically" : ""}
              </span>
              <Btn size="xs" kind="quiet" onClick={() => onRestoreCut(r.k)}>
                Restore
              </Btn>
            </div>
          )
        )}
      </div>
      <Hint>
        Point at the video on the timeline and Ctrl + click (⌘ + click on a Mac) to cut it into clips. Click a clip to
        select it, then drag its edges to trim it, or delete it to take it out. Restore brings back anything taken out.
      </Hint>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Zoom
   ──────────────────────────────────────────────────────────────────────────── */

export function ZoomPanel({ tl, selection, onSelect, edit, time, seek }) {
  const zooms = [...(tl.zooms || [])].sort((a, b) => a.start - b.start);
  const current = zooms.find((z) => z.id === selection?.id && selection.kind === "zoom") || null;

  const add = () => {
    const { item, patch, label } = create("zoom", tl, time);
    edit(patch, label);
    onSelect({ kind: "zoom", id: item.id });
  };

  return (
    <>
      <Panel
        title={`Zooms · ${zooms.length}`}
        action={
          <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={add}>
            Add
          </Btn>
        }
      >
        {zooms.length === 0 ? (
          <Empty icon="zoom" title="No camera moves" action={<Btn size="s" onClick={add}>Add one at the playhead</Btn>}>
            A demo with no zoom shows everything at once, which means it shows nothing in particular.
          </Empty>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {zooms.map((z, i) => (
              <Row
                key={z.id}
                accent="#918DFF"
                selected={current?.id === z.id}
                onClick={() => {
                  onSelect({ kind: "zoom", id: z.id });
                  seek(z.start + 0.05);
                }}
                onRemove={() => edit({ zooms: tl.zooms.filter((x) => x.id !== z.id) }, "Remove zoom")}
                title={z.label || `Zoom ${i + 1}`}
                sub={`${fmtTime(z.start, true)} – ${fmtTime(z.end, true)} · ${Number(z.level).toFixed(1)}×`}
                badge={z.auto ? <Badge tone="ai">AI</Badge> : null}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* ── Two controls, on purpose ─────────────────────────────────────
          How far in, and what to call it. Everything else a zoom has is set
          without a form:
            • timing: drag the zoom's block on the timeline, whose edges are
              its start and end. The number steppers and "Start here / End
              here" beside it were a second, slower way to do the same thing.
            • easing: always Smooth. New zooms are made that way, the analysis
              is held to it, and a choice between three curves nobody can
              tell apart at a glance was not a choice worth showing.
            • the framing: drag the rectangle on the preview. */}
      {current && (
        <Panel title="Selected zoom">
          <Slider
            label="Zoom level"
            min={1.05}
            max={3}
            step={0.05}
            value={current.level}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { level: v }), "Zoom level")}
            format={(v) => `${v.toFixed(2)}×`}
            hint={current.level > 2.6 ? "Past about 2.5× the recording runs out of pixels and the picture goes soft." : undefined}
          />
          {/* Follow the cursor: hidden for now, kept to bring back.
          <Toggle
            label="Follow the cursor"
            hint="The camera tracks the pointer instead of holding still. For a drag or a scroll — on a still target it drifts and looks like a mistake."
            checked={!!current.follow}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { follow: v }), "Follow cursor")}
          />
          {current.follow && (
            <Slider
              label="How closely"
              min={0.2}
              max={1}
              step={0.05}
              value={current.follow_strength ?? 0.7}
              onChange={(v) => edit(patch(tl, "zooms", current.id, { follow_strength: v }), "Follow strength")}
              format={pct}
            />
          )}
          */}
          <Field
            label="Label"
            value={current.label}
            placeholder="What this is on"
            maxLength={80}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { label: v }), "Zoom label")}
          />
          <Hint>Drag the rectangle on the preview to choose what the camera holds.</Hint>
        </Panel>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Blur
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The privacy panel.
 *
 * ── THIS IS THE ONE THAT HAS TO BE RIGHT ─────────────────────────────────────
 * Everything else here is about how a demo looks. This is about whether an API
 * key, an email address or a customer's name goes out to the internet, and it
 * cannot be undone after publishing. So:
 *
 *   • Every region the AI found is listed, with what it thinks it is and how
 *     sure it was. Nothing is applied invisibly.
 *   • Every one can be deleted, retimed, moved, resized and restyled. A blur
 *     that cannot be adjusted is one a creator works around by re-recording.
 *   • A region can be added anywhere, at any time, in two clicks.
 *   • The times are editable as numbers AND settable from the playhead,
 *     because "from here to the end" is the common case and dragging to it is
 *     the slow way to say it.
 *   • The whole list can be previewed by clicking a row, which seeks to it.
 */
/**
 * ── THE SCREENS ARE READ WHEN SOMEBODY ASKS ─────────────────────────────────
 * The automatic edit is made from the recording itself — where the pointer
 * was, what shape the operating system drew it, what changed on screen — and
 * none of that needs a model. Reading what is ON the screen does, and that is
 * what finds an API key to blur and what names the steps.
 *
 * So these two panels can be open on a demo whose screens nobody has read yet,
 * and they have to say so. The alternative is the version of this that shipped
 * first: an empty blur list under the words "Nothing private found. Every
 * sampled frame was checked for emails, keys, tokens and personal details" on
 * a demo where no frame was checked at all. A promise like that is worse than
 * no promise, because the creator acts on it and exports.
 */
function Unread({ icon, title, children, reading, onRead, readCost }) {
  return (
    <Empty
      icon={icon}
      title={title}
      action={
        <Btn size="s" kind="primary" onClick={onRead} disabled={reading}>
          {reading ? "Reading the screens…" : readCost > 0 ? `Read the screens · ${readCost} credits` : "Read the screens"}
        </Btn>
      }
    >
      {children}
    </Empty>
  );
}

/** One word for where a blur is with being applied (follow.mjs applyState), for the list. */
const APPLY_BADGE = {
  unapplied: { tone: "warn", text: "Not applied" },
  applying: { tone: "mute", text: "Applying…" },
  applied: { tone: "good", text: "Applied" },
  still: { tone: "mute", text: "Stays put" },
  failed: { tone: "warn", text: "Not applied" },
};

/**
 * Where an applied blur shows, in output time: [{ start, end }], the
 * stretches it covers its secret, as the timeline draws them.
 */
function coveredSpans(b, follows, st, lay) {
  const f = st.kind === "applied" ? follows?.[b.id] : null;
  const src = f ? coverage(f, b.end) : st.kind === "still" ? [[b.start, b.end]] : [];
  return placedSpans(src.map(([s, e]) => ({ start: s, end: e })), lay, { min: 0.005 });
}

export function BlurPanel({
  tl, selection, onSelect, edit, time, seek, read = true, reading = false, onRead, readCost = 0,
  follows = null, following = null, onApply,
}) {
  // In the order they sit in the recording, where each was placed, numbered
  // the same way as on the timeline (follow.mjs blurNames).
  const blurs = [...(tl.blurs || [])].sort((a, b) => (a.at ?? a.start) - (b.at ?? b.start));
  const names = useMemo(() => blurNames(tl.blurs), [tl.blurs]);
  const lay = useMemo(() => layout(tl), [tl]);
  const current = blurs.find((b) => b.id === selection?.id && selection.kind === "blur") || null;
  const auto = blurs.filter((b) => b.auto).length;

  // To the end of the recording by default; create.js says why.
  const add = () => {
    const { item, patch, label } = create("blur", tl, time);
    edit(patch, label);
    onSelect({ kind: "blur", id: item.id });
  };

  return (
    <>
      <Panel
        title={`Blur · ${blurs.length}`}
        action={
          <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={add}>
            Add
          </Btn>
        }
      >
        {blurs.length === 0 && !read ? (
          <Unread icon="blur" title="Nothing has been checked yet" reading={reading} onRead={onRead} readCost={readCost}>
            Your edit was made from the recording itself, which needs no AI. Finding emails, keys, tokens and personal
            details does — it means reading what is on every sampled frame. You can also{" "}
            <button
              type="button"
              onClick={add}
              style={{ font: "inherit", color: "var(--primary)", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            >
              blur something by hand
            </button>.
          </Unread>
        ) : blurs.length === 0 ? (
          <Empty icon="blur" title="Nothing private found" action={<Btn size="s" onClick={add}>Add one anyway</Btn>}>
            Every sampled frame was checked for emails, keys, tokens and personal details. Add your own if something was
            missed.
          </Empty>
        ) : (
          <>
            {auto > 0 && (
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-mute)", marginTop: -4 }}>
                {auto} found automatically. Click one to see it on the picture.
              </div>
            )}
            <div style={{ display: "grid", gap: 2, margin: -6 }}>
              {blurs.map((b) => {
                const st = applyState(b, follows, following);
                const badge = APPLY_BADGE[st.kind];
                const spans = coveredSpans(b, follows, st, lay);
                // Where it shows once applied; where it was placed until then.
                const where = spans.length
                  ? `On screen ${fmtTime(spans[0].start, true)} – ${fmtTime(spans[0].end, true)}${spans.length > 1 ? ` +${spans.length - 1}` : ""}`
                  : st.kind === "applied"
                    ? "Not on screen after cuts"
                    : `Placed at ${fmtTime(outOf(b.at ?? b.start, lay), true)}`;
                return (
                  <Row
                    key={b.id}
                    accent="#FF9482"
                    selected={current?.id === b.id}
                    onClick={() => {
                      onSelect({ kind: "blur", id: b.id });
                      seek(outOf(b.at ?? b.start, lay) + 0.02);
                    }}
                    onRemove={() => edit({ blurs: tl.blurs.filter((x) => x.id !== b.id) }, "Remove blur")}
                    title={names.get(b.id)}
                    sub={`${where} · ${KIND_LABEL[b.kind] || b.kind}`}
                    badge={
                      <>
                        {b.auto ? <Badge tone="ai">AI</Badge> : null}
                        {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
                      </>
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {current && (
        <Panel title={names.get(current.id) || "Selected blur"}>
          <ApplyStatus
            blur={current}
            st={applyState(current, follows, following)}
            spans={coveredSpans(current, follows, applyState(current, follows, following), lay)}
            seekTo={(outT) => seek(outT + 0.02)}
            onApply={() => onApply?.(current)}
          />
          <div>
            <Label>Cover it with</Label>
            <Segmented
              full
              size="s"
              value={current.kind}
              onChange={(v) => edit(patch(tl, "blurs", current.id, { kind: v }), "Blur style")}
              options={[
                { value: "blur", label: "Blur", title: "Softened. Reads as deliberate." },
                { value: "pixelate", label: "Pixelate", title: "Blocks. For faces and photographs." },
                { value: "box", label: "Solid", title: "Covered completely. For a full secret key." },
              ]}
            />
          </div>

          {current.kind !== "box" && (
            <Slider
              label="Strength"
              min={0.2}
              max={1}
              step={0.05}
              value={current.strength ?? 0.8}
              onChange={(v) => edit(patch(tl, "blurs", current.id, { strength: v }), "Blur strength")}
              format={pct}
              hint={current.strength < 0.45 ? "At this strength small text can still be readable when the video is paused." : undefined}
            />
          )}

          {/* A blur's timing is not set by hand any more: once applied it
              covers its secret wherever it is on screen (follow.mjs, "Applying
              a blur"), so a span to drag only got in the way. Kept for later.
          <TimeRange
            tl={tl}
            item={current}
            time={time}
            onChange={(p) => edit(patch(tl, "blurs", current.id, p), "Blur timing")}
            extra={
              <Btn
                size="xs"
                onClick={() => edit(patch(tl, "blurs", current.id, { start: 0, end: tl.duration || current.end }), "Blur whole video")}
                title="Cover this region for the entire recording"
              >
                Whole video
              </Btn>
            }
          />
          */}

          <Field
            label="What is it"
            value={current.label}
            placeholder="e.g. account email"
            maxLength={60}
            onChange={(v) => edit(patch(tl, "blurs", current.id, { label: v }), "Blur label")}
            hint="Only for your own list. Never write the secret itself here."
          />

          <Hint>
            Drag the box on the preview over what it should hide, and its corners to fit it, then apply it. Moving it
            afterwards means applying it again, from the moment on screen.
          </Hint>
        </Panel>
      )}
    </>
  );
}

const KIND_LABEL = { blur: "Blurred", pixelate: "Pixelated", box: "Covered" };

/* ────────────────────────────────────────────────────────────────────────────
   Captions
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── CAPTIONS ARE OPT-IN, AND THERE ARE THREE WAYS TO GET THEM ────────────────
 * A silent screen recording transcribed produces captions of room tone, and
 * burning those onto a clean demo is worse than having none: it is now a thing
 * to find and turn off. So a demo arrives here with no captions unless they
 * were asked for, and this panel is where they are asked for.
 *
 *   from the script   the voiceover the studio already wrote for this demo,
 *                     chunked into lines. Free and instant — no audio needed,
 *                     which is what a silent product demo actually has.
 *   from my voice     transcribed, for a demo that was narrated live.
 *   by hand           typed here.
 *
 * ── THE CONTROLS ARE THE SCRIPT EDITOR'S ─────────────────────────────────────
 * Colour and size come from src/components/Edit/captionStyle.js, unchanged, so
 * a founder who styled a caption in Edit Videos finds the same swatches, the
 * same hex field and the same pixel box here. Placement is by hand on the
 * picture for the same reason: a Top / Middle / Bottom control cannot put a
 * caption beside the thing it is about, and every demo has one screen where
 * the bottom of the frame is the part that matters.
 */
export function CaptionsPanel({ tl, selection, onSelect, edit, time, seek, onGenerate, onGenerateFromScript, generating, hasAudio }) {
  const cues = [...(tl.cues || [])].sort((a, b) => a.start - b.start);
  const cap = tl.captions || {};
  const current = cues.find((c) => c.id === selection?.id && selection.kind === "cue") || null;
  const hasScript = (tl.narration || []).length > 0;
  const placed = cap.x != null || cues.some((c) => c.custom?.x != null);

  const addCue = () => {
    const { item, patch, label } = create("cue", tl, time);
    edit(patch, label);
    onSelect({ kind: "cue", id: item.id });
  };

  const setCap = (fields, label) => edit({ captions: { ...cap, ...fields } }, label);
  const track = lineSize(cap, null);

  return (
    <>
      <Panel title="Captions">
        <Toggle
          label="Show captions"
          hint={cues.length ? `${cues.length} line${cues.length === 1 ? "" : "s"}.` : "None yet. Write them from the script, from your voice, or by hand."}
          checked={!!cap.enabled}
          onChange={(v) => setCap({ enabled: v }, v ? "Captions on" : "Captions off")}
          disabled={!cues.length}
        />

        {!cues.length && (
          <div style={{ display: "grid", gap: 9 }}>
            <Btn
              kind="primary"
              icon={<Icon name="caption" size={14} />}
              onClick={onGenerateFromScript}
              disabled={!hasScript || generating}
              full
            >
              Add captions from the script
            </Btn>
            <Hint>
              {hasScript
                ? "Uses the voiceover script already written for this demo, split into lines and timed to the steps. Free, and it matches what you will say if you record the voiceover."
                : "There is no voiceover script for this recording yet. It is written during the automatic edit."}
            </Hint>

            <Btn
              icon={<Icon name="wand" size={14} />}
              onClick={onGenerate}
              disabled={!hasAudio || generating}
              full
            >
              {generating ? "Listening…" : "Write captions from my voice"}
            </Btn>
            {!hasAudio && <Hint>This recording has no sound, so there is nothing to transcribe.</Hint>}

            <Btn size="s" icon={<Icon name="plus" size={12} />} onClick={addCue} full>
              Add a caption by hand
            </Btn>
          </div>
        )}

        {cap.enabled && cues.length > 0 && (
          <>
            <div>
              <Label>Look</Label>
              <CaptionLooks value={cap.style} color={cap.color || "#FFFFFF"} strip={cap.bg} onChange={(v) => setCap({ style: v }, "Caption look")} />
            </div>
            <div>
              <Label>Text colour</Label>
              <ColorPicker
                value={cap.color || "#FFFFFF"}
                keyId="all"
                onChange={(hex, key) => setCap({ color: hex === "#FFFFFF" ? null : hex }, key || "Caption colour")}
              />
            </div>
            <div>
              <Label>Background</Label>
              <StripPicker value={cap.bg} keyId="all" onChange={(v, key) => setCap({ bg: v }, key || "Caption background")} />
            </div>
            <div>
              <Label>Size</Label>
              <SizePicker
                size={track.size}
                px={track.shown}
                min={CAPTION_PX.min}
                max={CAPTION_PX.max}
                onPreset={(v) => setCap({ size: v, px: null }, "Caption size")}
                onPx={(px) => setCap({ px }, "px:all")}
              />
            </div>
            <div>
              <Label>Placement</Label>
              <Hint>
                Drag the captions on the picture, anywhere you want. Moving the first one moves them all; moving any
                other moves only that line.
              </Hint>
              {placed && (
                <Btn
                  size="xs"
                  icon={<Icon name="reset" size={12} />}
                  onClick={() =>
                    edit(
                      { captions: { ...cap, x: null, y: null }, cues: cues.map((c) => (c.custom ? { ...c, custom: { ...c.custom, x: null, y: null } } : c)) },
                      "Reset placement"
                    )
                  }
                >
                  Put them back at the bottom
                </Btn>
              )}
            </div>
          </>
        )}
      </Panel>

      {cap.enabled && cues.length > 0 && (
        <Panel
          title={`Lines · ${cues.length}`}
          action={
            <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={addCue}>
              Add
            </Btn>
          }
        >
          <div className="st-scroll" style={{ display: "grid", gap: 2, margin: -6, maxHeight: 230 }}>
            {cues.map((c) => (
              <Row
                key={c.id}
                accent="#C77DFF"
                selected={current?.id === c.id}
                onClick={() => {
                  onSelect({ kind: "cue", id: c.id });
                  seek(c.start + 0.05);
                }}
                onRemove={() => edit({ cues: cues.filter((x) => x.id !== c.id) }, "Remove caption")}
                title={c.text}
                sub={fmtTime(c.start, true)}
                badge={c.custom ? <Badge>Styled</Badge> : null}
              />
            ))}
          </div>
        </Panel>
      )}

    </>
  );
}

/**
 * What one caption line is drawn at, whether it was given a size of its own or
 * follows the track (cue null: the track itself). The pixel field must never
 * go blank.
 */
/** "#fff" as "#FFFFFF": the colour pickers compare full six-digit codes. */
const fullHex = (h) => (/^#[0-9a-f]{3}$/i.test(h) ? `#${h.slice(1).split("").map((c) => c + c).join("")}` : String(h)).toUpperCase();

/**
 * The words of a line to highlight, typed as "Billing, Settings". Kept as
 * typed while it has focus: the list it is saved as has no room for a comma
 * that has no word after it yet, and writing the list back into the box on
 * every key swallowed each comma the moment it was typed, so a second word
 * could never be entered.
 */
function HighlightField({ cue, onChange }) {
  const joined = (cue.emphasis || []).join(", ");
  const [draft, setDraft] = useState(joined);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setDraft(joined);
  }, [joined, focus, cue.id]);
  return (
    <div onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
      <Field
        label="Highlight"
        value={draft}
        maxLength={200}
        placeholder="e.g. Billing, Settings"
        onChange={(v) => {
          setDraft(v);
          onChange(v.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 6));
        }}
        hint="Type words from this line to make them stand out, separated by commas. They are drawn in the highlight colour below."
      />
    </div>
  );
}

function lineSize(cap, cue) {
  const size = cue?.custom?.size || cap.size || "m";
  const px = cue?.custom?.px ?? cap.px ?? null;
  return { size, px, shown: px != null ? px : Math.round((CAPTION_SIZES[size] || CAPTION_SIZES.m) * 1080) };
}

/**
 * One caption line on its own: its words, which of them are highlighted and
 * in what colour, and how it is styled apart from the rest. Not its timing:
 * that is dragged on the timeline, where it can be seen against everything
 * else. Shown in a drawer over the
 * inspector while the line is selected (StudioEditor), so the list of lines
 * and the track's settings stay where they were underneath.
 */
export function CaptionLine({ tl, cue, edit }) {
  const cap = tl.captions || {};
  const setOne = (fields, label) => edit(patch(tl, "cues", cue.id, { custom: { ...(cue.custom || {}), ...fields } }), label);
  const size = lineSize(cap, cue);

  return (
    <>
      <Field
        label="Text"
        multiline
        value={cue.text}
        maxLength={300}
        onChange={(v) => edit(patch(tl, "cues", cue.id, { text: v }), "Caption text")}
      />
      <div style={{ display: "grid", gap: 10 }}>
        <HighlightField
          cue={cue}
          onChange={(words) => edit(patch(tl, "cues", cue.id, { emphasis: words }), "Caption highlight")}
        />
        <MiniLabel text="Highlight colour">
          <ColorPicker
            compact
            value={cue.custom?.accent || fullHex((CAPTION_LOOKS[cue.custom?.style || cap.style] || CAPTION_LOOKS.trylipi).accent)}
            keyId={`hl:${cue.id}`}
            onChange={(hex, key) => setOne({ accent: hex }, key || "Highlight colour")}
          />
        </MiniLabel>
      </div>

      <div>
        <Label>Just this line</Label>
        <div style={{ display: "grid", gap: 13, justifyItems: "start" }}>
          <MiniLabel text="Text colour">
            <ColorPicker
              compact
              value={cue.custom?.color || cap.color || "#FFFFFF"}
              keyId={cue.id}
              onChange={(hex, key) => setOne({ color: hex }, key || "Line colour")}
            />
          </MiniLabel>
          <MiniLabel text="Background">
            <StripPicker
              compact
              value={cue.custom?.bg ?? cap.bg}
              keyId={cue.id}
              onChange={(v, key) => setOne({ bg: v }, key || "Line background")}
            />
          </MiniLabel>
          <MiniLabel text="Size">
            <SizePicker
              compact
              size={size.size}
              px={size.shown}
              min={CAPTION_PX.min}
              max={CAPTION_PX.max}
              onPreset={(v) => setOne({ size: v, px: null }, "Line size")}
              onPx={(px) => setOne({ px }, `px:${cue.id}`)}
            />
          </MiniLabel>
          <MiniLabel text="Look">
            <CaptionLooks
              compact
              value={cue.custom?.style || cap.style}
              color={cue.custom?.color || cap.color || "#FFFFFF"}
              strip={cue.custom?.bg ?? cap.bg}
              onChange={(v) => setOne({ style: v }, "Line look")}
            />
          </MiniLabel>
          <Toggle
            label="Bold"
            checked={cue.custom?.bold !== false}
            onChange={(v) => setOne({ bold: v ? null : false }, "Line weight")}
          />
          {cue.custom && (
            <Btn size="xs" icon={<Icon name="reset" size={12} />} onClick={() => edit(patch(tl, "cues", cue.id, { custom: null }), "Reset line style")}>
              Match the rest
            </Btn>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The five caption looks, each tile drawn in its own look over a scrap of
 * picture — the same idea as the script editor's, with this product's styles.
 * A named list of styles tells a creator nothing; seeing "Sale leak" in Hormozi
 * yellow tells them everything.
 */
function CaptionLooks({ value, color, strip = null, onChange, compact = false }) {
  return (
    <div
      role="group"
      aria-label="Caption look"
      style={
        compact
          ? { display: "inline-flex", gap: 3, flexWrap: "wrap" }
          : { display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 6 }
      }
    >
      {CAPTION_STYLES.map((name) => {
        const look = CAPTION_LOOKS[name] || CAPTION_LOOKS.trylipi;
        const on = value === name;
        // The strip the creator chose, else the look's own (model.js captionStrip).
        const band = strip === "none" ? null : /^#[0-9a-f]{6}$/i.test(strip || "") ? strip : look.box ? "rgba(0,0,0,.6)" : null;
        const text = {
          fontWeight: look.weight,
          color: look.color === "#fff" ? color : look.color,
          textTransform: look.caps ? "uppercase" : "none",
          textShadow: look.shadow === "none" || band ? "none" : look.shadow,
          background: band || "transparent",
          padding: band ? "1px 4px" : 0,
          ...(look.stroke ? { WebkitTextStroke: `0.4px ${look.stroke}` } : {}),
        };
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            title={STYLE_LABEL[name] || name}
            onClick={() => onChange(name)}
            style={{
              padding: 0, overflow: "hidden", cursor: "pointer", fontFamily: "inherit",
              borderRadius: compact ? 6 : 9,
              border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`,
              background: "var(--card)",
              ...(compact ? { width: 30, height: 26 } : {}),
            }}
          >
            <span style={{ display: "grid", placeItems: "center", height: compact ? 22 : 40, background: LOOK_TILE }}>
              <span style={{ fontSize: compact ? 11 : 12, lineHeight: 1, ...text }}>{compact ? "A" : "Aa"}</span>
            </span>
            {!compact && (
              <span style={{ display: "block", padding: "5px 0", fontSize: 10.5, fontWeight: 650, color: on ? "var(--ink)" : "var(--ink-mute)" }}>
                {STYLE_LABEL[name] || name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const LOOK_TILE = "linear-gradient(135deg,#6B7F95,#C9A27A)";

/** The strip colours offered (the creator's pick); any other is a hex code away. */
const STRIP_COLORS = [
  ["#000000", "Black"],
  ["#3f3f46", "Grey"],
  ["#e11d48", "Red"],
];

/**
 * The strip behind the captions (model.js captionStrip, render/ass.js): none,
 * one of a few colours, or any other by its code. `value` null is "the look's
 * own" (Quiet has a dark one; the rest none), and nothing shows as chosen.
 * Built like the text colour's picker beside it, so the two read as a pair.
 */
function StripPicker({ value, onChange, keyId = "all", compact = false }) {
  const d = compact ? 16 : 30;
  const v = String(value || "").toLowerCase();
  const ring = (on) => (on ? `0 0 0 2px ${compact ? "var(--card)" : "var(--paper)"}, 0 0 0 ${compact ? 3.5 : 4}px var(--ink)` : "none");
  const dot = { width: d, height: d, borderRadius: "50%", padding: 0, cursor: "pointer", flexShrink: 0, border: "1px solid rgba(0,0,0,.2)" };
  return (
    <div
      role="group"
      aria-label="Caption background"
      style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: compact ? 6 : 10, flexShrink: 0 }}
    >
      <button
        type="button"
        aria-label="No background"
        aria-pressed={v === "none"}
        title="None"
        onClick={() => onChange("none")}
        style={{
          ...dot,
          background: "linear-gradient(135deg, transparent calc(50% - 1px), #E5484D calc(50% - 1px), #E5484D calc(50% + 1px), transparent calc(50% + 1px)), #fff",
          boxShadow: ring(v === "none"),
        }}
      />
      {STRIP_COLORS.map(([hex, name]) => (
        <button
          key={hex}
          type="button"
          aria-label={name}
          aria-pressed={v === hex}
          title={name}
          onClick={() => onChange(hex)}
          style={{ ...dot, background: hex, boxShadow: ring(v === hex) }}
        />
      ))}
      <HexInput
        value={/^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : "#000000"}
        compact={compact}
        onChange={(hex) => onChange(hex.toLowerCase(), `bg:${keyId}`)}
      />
    </div>
  );
}

/** A small name over a compact control, where several share one heading. */
function MiniLabel({ text, children }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 650, color: "var(--ink-mute)" }}>{text}</span>
      {children}
    </div>
  );
}
const STYLE_LABEL = { trylipi: "Clipo", hormozi: "Bold", apple: "Quiet", minimal: "Minimal", neon: "Neon" };
/** Caption pixels are measured against a 1080-short-side frame. See render/ass.js. */
const CAPTION_PX = { min: 12, max: 96 };

/* ────────────────────────────────────────────────────────────────────────────
   Cursor
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The drawn pointer, its click ripple and the path as recorded are not
 * choices (2026-09-28): every demo has all three, so what is left here is how
 * they look. The same colours are drawn in the preview and the export
 * (cursorLook.mjs).
 */
export function CursorPanel({ tl, edit }) {
  const cur = tl.cursor || {};
  const points = tl.track?.length || 0;
  const set = (patch, label) => edit({ cursor: { ...cur, ...patch } }, label);
  const ripple = (
    <div>
      <Label>Click ripple</Label>
      <ColorRow
        label="Ripple"
        value={isHex(cur.ripple_color) ? cur.ripple_color : DEFAULT_RIPPLE_COLOR}
        presets={RIPPLE_COLORS}
        onChange={(c) => set({ ripple_color: c }, "Ripple colour")}
      />
    </div>
  );

  return (
    <Panel title="Cursor">
      {points === 0 ? (
        <>
          <Empty icon="cursor" title="No pointer was recovered">
            The pointer is read back out of the recording's own pixels, and this one was too busy to read — a full-screen
            video or a constantly repainting page. Zooms and annotations still work.
          </Empty>
          {ripple}
        </>
      ) : (
        <>
          <div>
            <Label>Look</Label>
            <CursorLook cur={cur} onChange={set} />
          </div>
          <Slider
            label="Size"
            min={CURSOR_SIZE_MIN}
            max={CURSOR_SIZE_MAX}
            step={0.05}
            value={cursorSize(cur)}
            onChange={(v) => set({ size: v }, "Cursor size")}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label="Glow"
            min={0}
            max={1}
            step={0.05}
            value={cur.glow ?? 0.35}
            onChange={(v) => set({ glow: v }, "Cursor glow")}
            format={pct}
          />
          {ripple}
        </>
      )}
    </Panel>
  );
}

const RIPPLE_COLORS = ["#ffffff", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];
/** The colour wheel's face: any colour, from the system's own picker. */
const WHEEL = "conic-gradient(#f5484d, #f5c542, #4cd07d, #3ba7f5, #a064f5, #f5484d)";
/** An invisible colour input laid over its tile, so a click on the tile opens the picker. */
const PICKER_INPUT = { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", padding: 0, border: 0 };

/**
 * Dark (the default), Light, or any colour. Styled as Segmented, which it
 * cannot be: its third choice is the system colour picker, opened by a click
 * on it.
 */
function CursorLook({ cur, onChange }) {
  const id = useId();
  const look = cursorLookName(cur.theme);
  const color = isHex(cur.color) ? cur.color : DEFAULT_CURSOR_COLOR;
  const item = (on) => ({
    flex: "1 1 0", position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    fontSize: 11, fontWeight: 650, lineHeight: 1.3, padding: "3px 7px", minHeight: 22, borderRadius: 8,
    border: "none", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
    background: on ? "var(--ink)" : "transparent",
    color: on ? "#fff" : "var(--ink-mute)",
    transition: "background var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)",
  });
  return (
    <div
      role="group"
      aria-label="Cursor look"
      style={{ display: "flex", gap: 2, padding: 2, borderRadius: 10, background: "var(--paper)", border: "1px solid var(--line)" }}
    >
      <button type="button" aria-pressed={look === "dark"} onClick={() => onChange({ theme: "dark" }, "Cursor look")} style={item(look === "dark")}>
        Dark
      </button>
      <button type="button" aria-pressed={look === "light"} onClick={() => onChange({ theme: "light" }, "Cursor look")} style={item(look === "light")}>
        Light
      </button>
      {/* Choosing it switches to it in the colour it last had; the picker it
          opens changes the colour. */}
      <label
        htmlFor={id}
        title="Any colour"
        onClick={() => {
          if (look !== "custom") onChange({ theme: "custom", color }, "Cursor colour");
        }}
        style={item(look === "custom")}
      >
        <span
          aria-hidden
          style={{
            width: 12, height: 12, borderRadius: 99, flexShrink: 0,
            background: look === "custom" ? color : WHEEL,
            boxShadow: "0 0 0 1px rgba(255,255,255,.7), 0 0 0 2px rgba(0,0,0,.12)",
          }}
        />
        Custom
        <input
          id={id}
          type="color"
          aria-label="Cursor colour"
          value={color}
          onChange={(e) => onChange({ theme: "custom", color: e.target.value }, "Cursor colour")}
          style={PICKER_INPUT}
        />
      </label>
    </div>
  );
}

/** A row of colour swatches, and a colour wheel for any other. */
function ColorRow({ label, value, presets, onChange }) {
  const id = useId();
  const v = String(value).toLowerCase();
  const custom = !presets.includes(v);
  const tile = (on) => ({
    width: 26, height: 26, borderRadius: 99, padding: 0, cursor: "pointer", flexShrink: 0,
    border: "1px solid var(--line)",
    boxShadow: on ? "0 0 0 2px var(--card), 0 0 0 4px var(--ink)" : "none",
  });
  return (
    <div role="group" aria-label={`${label} colour`} style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", padding: "2px 2px 0" }}>
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`${label} ${c}`}
          aria-pressed={!custom && v === c}
          onClick={() => onChange(c)}
          style={{ ...tile(!custom && v === c), background: c }}
        />
      ))}
      <label htmlFor={id} title="Any colour" style={{ ...tile(custom), position: "relative", display: "grid", placeItems: "center", background: WHEEL }}>
        {custom && <span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, background: v, boxShadow: "0 0 0 2px #fff" }} />}
        <input id={id} type="color" aria-label={`${label}: any colour`} value={v} onChange={(e) => onChange(e.target.value)} style={PICKER_INPUT} />
      </label>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Canvas
   ──────────────────────────────────────────────────────────────────────────── */

export function CanvasPanel({ tl, edit }) {
  const c = tl.canvas || {};
  const bg = c.background || { kind: "none" };

  return (
    <Panel title="Canvas">
      <div>
        <Label>Shape</Label>
        <Segmented
          full
          size="xs"
          value={c.aspect || "source"}
          onChange={(v) => edit({ canvas: { ...c, aspect: v } }, "Aspect")}
          options={[
            // First and default: the recording's own shape, at its own size.
            // Anything else scales the picture to fit and softens the text.
            { value: "source", label: "As recorded" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "1:1", label: "1:1" },
            { value: "4:5", label: "4:5" },
          ]}
        />
      </div>

      <div>
        <Label>Background</Label>
        <Segmented
          full
          size="xs"
          value={bg.kind}
          onChange={(v) => edit({ canvas: { ...c, background: { kind: v, value: v === "solid" ? "#101318" : "dusk" } } }, "Background")}
          options={[
            { value: "gradient", label: "Gradient" },
            { value: "solid", label: "Solid" },
            { value: "none", label: "None" },
          ]}
        />
      </div>

      {bg.kind === "gradient" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
          {Object.entries(GRADIENTS).map(([name, stops]) => {
            const on = bg.value === name;
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-pressed={on}
                onClick={() => edit({ canvas: { ...c, background: { kind: "gradient", value: name } } }, "Background")}
                style={{
                  aspectRatio: "1", borderRadius: 9, cursor: "pointer", padding: 0,
                  background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]} 55%, ${stops[2]})`,
                  border: on ? "2px solid var(--ink)" : "1px solid var(--line)",
                }}
              />
            );
          })}
        </div>
      )}

      {bg.kind === "solid" && (
        <Swatches
          value={bg.value}
          options={["#101318", "#1C1E22", "#0B2B3A", "#12281A", "#2B1A14", "#F3F1EC", "#E8EDF2"]}
          onChange={(v) => edit({ canvas: { ...c, background: { kind: "solid", value: v } } }, "Background")}
          size={30}
        />
      )}

      <Slider
        label="Video size"
        min={0}
        max={0.22}
        step={0.005}
        value={c.padding ?? 0}
        onChange={(v) => edit({ canvas: { ...c, padding: v } }, "Video size")}
        format={(v) => pct(1 - v * 2)}
      />
      <Slider
        label="Corner radius"
        min={0}
        max={56}
        step={1}
        value={c.radius ?? 0}
        onChange={(v) => edit({ canvas: { ...c, radius: v } }, "Corner radius")}
        format={(v) => `${Math.round(v)}px`}
      />
      <Slider
        label="Shadow"
        min={0}
        max={1}
        step={0.05}
        value={c.shadow ?? 0.5}
        onChange={(v) => edit({ canvas: { ...c, shadow: v } }, "Shadow")}
        format={(v) => (v === 0 ? "None" : pct(v))}
      />
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Steps and suggestions
   ──────────────────────────────────────────────────────────────────────────── */

export function StepsPanel({ tl, time, seek, summary, narration, read = true, reading = false, onRead, readCost = 0 }) {
  const steps = tl.steps || [];
  const lay = useMemo(() => layout(tl), [tl]);

  return (
    <>
      {summary && (
        <Panel title="What this demo shows">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>{summary}</p>
        </Panel>
      )}
      <Panel title={`Steps · ${steps.length}`}>
        {steps.length === 0 && !read ? (
          <Unread icon="steps" title="The screens haven't been read yet" reading={reading} onRead={onRead} readCost={readCost}>
            Naming the steps means reading what is on each frame. It also finds anything private to blur, and writes a
            voiceover script you can turn into captions.
          </Unread>
        ) : steps.length === 0 ? (
          <Empty icon="steps" title="No steps were found">
            The recording may be too short, or nothing identifiable happened in it.
          </Empty>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {steps.map((s, i) => {
              const out = outOf(s.start, lay);
              const on = time >= out && time <= outOf(s.end, lay);
              return (
                <Row
                  key={s.id}
                  accent={s.importance === "high" ? "#74DDB0" : "#918DFF"}
                  selected={on}
                  onClick={() => seek(out + 0.05)}
                  title={`${i + 1}. ${s.title}`}
                  sub={s.detail}
                  badge={s.importance === "high" ? <Badge tone="good">Key</Badge> : null}
                />
              );
            })}
          </div>
        )}
      </Panel>
      {narration?.length > 0 && (
        <Panel title="Voiceover script">
          <div style={{ display: "grid", gap: 11 }}>
            {narration.map((n) => (
              <div key={n.id}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(n.start, true)}
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--ink-body)" }}>{n.text}</p>
              </div>
            ))}
          </div>
          <Hint>Written from what happened on screen. Read it over the demo, or paste it into a description.</Hint>
        </Panel>
      )}
    </>
  );
}

export function SuggestionsPanel({ analysis, onApply, onDismiss, onRefresh, busy }) {
  const list = analysis?.suggestions || [];
  const audit = analysis?.audit || null;
  return (
    <Panel
      title="Review"
      action={
        <Btn size="xs" onClick={onRefresh} disabled={busy}>
          {busy ? "Looking…" : "Check again"}
        </Btn>
      }
    >
      {analysis?.verdict && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-body)" }}>{analysis.verdict}</p>
      )}
      {list.length === 0 ? (
        <Empty icon="check" title="Nothing to fix">
          {/**
           * ── "NOTHING TO FIX" MEANS TWO VERY DIFFERENT THINGS ──────────────
           * Either the recording was checked moment by moment and came back
           * clean, or nobody looked. Those deserve different sentences: the
           * first is a reassurance and the second is an explanation of why the
           * panel is empty.
           */}
          {audit?.checked
            ? `The edit was read back, and ${audit.checked} moment${audit.checked === 1 ? "" : "s"} in the recording ${audit.checked === 1 ? "was" : "were"} checked against it. Nothing stood out.`
            : "The edit was read back and nothing stood out."}
        </Empty>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {list.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "11px 12px", borderRadius: 12,
                border: "1px solid", borderColor: s.severity === "high" ? "#F5C7C3" : "var(--line)",
                background: s.severity === "high" ? "#FCE8E6" : "var(--card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{s.title}</span>
                {/**
                 * Where the advice came from, because the two kinds are not
                 * equally sure of themselves. A note about pacing is one
                 * editor's opinion of the timeline; this one is two frames of
                 * the recording showing something the edit did not account for.
                 */}
                {s.source === "audit" && <Badge>From the recording</Badge>}
                {/* A model that watched the whole recording saw a click the camera did not zoom on. See witness.js. */}
                {s.source === "witness" && <Badge>Second check</Badge>}
                {s.severity === "high" && <Badge tone="warn">Important</Badge>}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.55, color: "var(--ink-mute)" }}>{s.why}</p>
              <div style={{ display: "flex", gap: 7 }}>
                <Btn size="xs" kind="primary" onClick={() => onApply(s.id)}>
                  Apply
                </Btn>
                <Btn size="xs" kind="quiet" onClick={() => onDismiss(s.id)}>
                  Ignore
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
      {audit?.changes > 0 && (
        <Hint>
          {audit.changes} moment{audit.changes === 1 ? "" : "s"} where the screen changed were measured in this
          recording{audit.checked ? `, and ${audit.checked} the edit did not account for were checked frame by frame` : ""}.
        </Hint>
      )}
    </Panel>
  );
}

/**
 * The selected blur's state (follow.mjs applyState) in a sentence, with the
 * one thing to do about it. Applying shows its progress, and says so plainly
 * when it is waiting to start or taking longer than it should, with a way to
 * ask again: a spinner with no end is the failure this replaced.
 */
function ApplyStatus({ blur, st, spans, seekTo, onApply }) {
  const box = (tone, children) => (
    <div
      role="status"
      style={{
        display: "grid", gap: 10, padding: "11px 12px", borderRadius: 10,
        fontSize: 12.5, lineHeight: 1.55,
        border: `1px solid ${tone === "warn" ? "#F1D6A8" : "var(--line)"}`,
        background: tone === "warn" ? "#FFF7E8" : "var(--paper)",
        color: "var(--ink-body)",
      }}
    >
      {children}
    </div>
  );
  const link = (label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{ font: "inherit", fontWeight: 650, color: "var(--ink)", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
    >
      {label}
    </button>
  );
  const applyBtn = (label) => (
    <Btn kind="primary" size="s" full icon={<Icon name="blur" size={13} />} onClick={onApply}>
      {label}
    </Btn>
  );
  const where = spans.length
    ? spans.length === 1
      ? `from ${fmtTime(spans[0].start, true)} to ${fmtTime(spans[0].end, true)}`
      : `${spans.length} times, first from ${fmtTime(spans[0].start, true)} to ${fmtTime(spans[0].end, true)}`
    : "";

  if (st.kind === "unapplied") {
    return box(
      "mute",
      <>
        <span>
          {blur.at == null ? "Drag the box onto what it should hide, then apply it." : "Placed. Apply it when the box is right."}{" "}
          Applying finds that thing through the whole recording and keeps it covered wherever it is on screen, as the page
          scrolls or changes.
        </span>
        {applyBtn("Apply blur")}
      </>
    );
  }
  if (st.kind === "applying") {
    const pct = Math.round((st.progress || 0) * 100);
    return box(
      st.slow ? "warn" : "mute",
      <>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 650, color: "var(--ink)" }}>
          <span className="st-spin" aria-hidden="true" />
          Applying blur…{pct > 0 ? ` ${pct}%` : ""}
        </span>
        <div style={{ height: 4, borderRadius: 4, background: "var(--hover)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(4, pct)}%`, background: "var(--primary)", transition: "width 400ms var(--ease-out)" }} />
        </div>
        <span style={{ color: "var(--ink-mute)", fontSize: 12 }}>
          {st.slow ? (
            <>This is taking longer than usual. {link("Try again", onApply)}</>
          ) : st.waiting ? (
            "Starting…"
          ) : (
            "Finding it through the recording. You can keep editing meanwhile."
          )}
        </span>
      </>
    );
  }
  if (st.kind === "applied") {
    return box(
      "mute",
      <span style={{ display: "flex", gap: 8 }}>
        <span style={{ color: "var(--ok)", marginTop: 3 }}><Icon name="check" size={13} /></span>
        <span>
          Applied. It covers this wherever it is on screen{where ? `: ${where}` : ""}, and steps aside while it is off the
          screen.{spans.length ? <> {link("Play it", () => seekTo(Math.max(0, spans[0].start - 0.5)))}</> : null}
        </span>
      </span>
    );
  }
  if (st.kind === "still") {
    return box(
      "mute",
      <span>
        Applied, but there is nothing under the box to recognise at that moment (an empty field, a plain panel), so it stays
        exactly where you put it for the whole video. To have it follow something, put the box on it at a moment it is
        showing and apply again.
      </span>
    );
  }
  return box(
    "warn",
    <>
      <span>{st.message || "We couldn't apply that blur"}. Until it is applied it stays where you put it.</span>
      {applyBtn("Try again")}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Shared bits
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * From / to, as numbers and as buttons.
 *
 * The buttons matter more than the numbers. "From here" while the playhead sits
 * on the frame where a dialog opened is exact and takes one click; finding the
 * same moment by nudging a number is how people give up and leave a blur two
 * seconds late.
 *
 * Parked: nothing uses it since caption lines left it too (2026-09-28). Timing
 * is dragged on the timeline, where it can be seen against everything else.
 */
// eslint-disable-next-line no-unused-vars
function TimeRange({ tl, item, time, onChange, extra }) {
  const lay = useMemo(() => layout(tl), [tl]);
  const srcNow = sourceOf(time, lay);
  const len = item.end - item.start;

  return (
    <div>
      <Label>Timing</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <Stepper
          value={item.start}
          max={item.end - 0.15}
          onChange={(v) => onChange({ start: v })}
        />
        <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>→</span>
        <Stepper
          value={item.end}
          min={item.start + 0.15}
          max={tl.duration || item.end}
          onChange={(v) => onChange({ end: v })}
        />
        <span style={{ fontSize: 11.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>{secs(len)}</span>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
        <Btn size="xs" onClick={() => onChange({ start: Math.min(srcNow, item.end - 0.15) })} title="Start at the playhead">
          Start here
        </Btn>
        <Btn size="xs" onClick={() => onChange({ end: Math.max(srcNow, item.start + 0.15) })} title="End at the playhead">
          End here
        </Btn>
        {extra}
      </div>
    </div>
  );
}

function Stepper({ value, min = 0, max = Infinity, onChange, step = 0.1 }) {
  const set = (v) => onChange(Math.round(clamp(v, min, max) * 1000) / 1000);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,.3)" }}>
      <button type="button" onClick={() => set(value - step)} style={stepBtn} aria-label="Earlier">
        −
      </button>
      <span style={{ minWidth: 52, textAlign: "center", fontSize: 12, fontWeight: 650, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
        {fmtTime(value, true)}
      </span>
      <button type="button" onClick={() => set(value + step)} style={stepBtn} aria-label="Later">
        +
      </button>
    </span>
  );
}

const stepBtn = {
  width: 24, height: 28, border: "none", background: "transparent", color: "var(--ink-body)",
  cursor: "pointer", fontSize: 15, lineHeight: 1, fontFamily: "inherit",
};

function Label({ children }) {
  return (
    <div style={{ marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--ink-mute)" }}>{children}</p>;
}

/** One item in one list, changed, as a patch for the whole timeline. */
function patch(tl, list, id, fields) {
  return { [list]: (tl[list] || []).map((x) => (x.id === id ? { ...x, ...fields } : x)) };
}

function outOf(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

function sourceOf(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}
