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
import { useMemo } from "react";
import { Btn, Segmented, Slider, Toggle, Field, Swatches, Panel, Row, Badge, Empty, Icon } from "./ui";
import { fmtTime, newId, clamp, layout, GRADIENTS, CAPTION_STYLES, CAPTION_SIZES, CAPTION_LOOKS } from "./model";
// Caption colour and size are the script editor's controls, not a second set.
import { ColorPicker, SizePicker } from "../Edit/captionStyle";

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(1)}s`;

/* ────────────────────────────────────────────────────────────────────────────
   Zooms
   ──────────────────────────────────────────────────────────────────────────── */

export function ZoomPanel({ tl, selection, onSelect, edit, time, seek }) {
  const zooms = [...(tl.zooms || [])].sort((a, b) => a.start - b.start);
  const current = zooms.find((z) => z.id === selection?.id && selection.kind === "zoom") || null;

  const add = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 1.5));
    const z = {
      id: newId("z"),
      start,
      end: Math.min(tl.duration || start + 2.5, start + 2.5),
      x: 0.3, y: 0.3, w: 0.4, h: 0.4,
      level: 1.8,
      easing: "smooth",
      camera: "region",
      follow: false,
      follow_strength: 0.7,
      label: "",
      auto: false,
    };
    edit({ zooms: [...(tl.zooms || []), z] }, "Add zoom");
    onSelect({ kind: "zoom", id: z.id });
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
          <TimeRange
            tl={tl}
            item={current}
            time={time}
            onChange={(p) => edit(patch(tl, "zooms", current.id, p), "Zoom timing")}
          />
          <div>
            <Label>Easing</Label>
            <Segmented
              full
              size="s"
              value={current.easing}
              onChange={(v) => edit(patch(tl, "zooms", current.id, { easing: v }), "Zoom easing")}
              options={[
                { value: "smooth", label: "Smooth" },
                { value: "snappy", label: "Snappy" },
                { value: "slow", label: "Slow" },
              ]}
            />
          </div>
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

export function BlurPanel({ tl, selection, onSelect, edit, time, seek, read = true, reading = false, onRead, readCost = 0 }) {
  const blurs = [...(tl.blurs || [])].sort((a, b) => a.start - b.start);
  const current = blurs.find((b) => b.id === selection?.id && selection.kind === "blur") || null;
  const auto = blurs.filter((b) => b.auto).length;

  const add = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 0.5));
    const b = {
      id: newId("b"),
      start,
      // To the end by default. The safe reading of "cover this" is the wider
      // one: a secret that is on screen now is usually on screen after, and a
      // blur that stops too early is the failure that matters.
      end: tl.duration || start + 3,
      x: 0.34, y: 0.42, w: 0.32, h: 0.09,
      kind: "blur",
      strength: 0.8,
      label: "",
      auto: false,
    };
    edit({ blurs: [...(tl.blurs || []), b] }, "Add blur");
    onSelect({ kind: "blur", id: b.id });
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
                {auto} found automatically. Click one to see it on the picture, and check each before you export.
              </div>
            )}
            <div style={{ display: "grid", gap: 2, margin: -6 }}>
              {blurs.map((b, i) => (
                <Row
                  key={b.id}
                  accent="#FF9482"
                  selected={current?.id === b.id}
                  onClick={() => {
                    onSelect({ kind: "blur", id: b.id });
                    seek(b.start + 0.05);
                  }}
                  onRemove={() => edit({ blurs: tl.blurs.filter((x) => x.id !== b.id) }, "Remove blur")}
                  title={b.label || `Region ${i + 1}`}
                  sub={`${fmtTime(b.start, true)} – ${fmtTime(b.end, true)} · ${KIND_LABEL[b.kind] || b.kind}`}
                  badge={
                    b.auto ? (
                      <Badge tone={b.confidence >= 0.65 ? "ai" : "warn"}>
                        {b.confidence >= 0.65 ? "AI" : "Check"}
                      </Badge>
                    ) : null
                  }
                />
              ))}
            </div>
          </>
        )}
      </Panel>

      {current && (
        <Panel title="Selected region">
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

          <Field
            label="What is it"
            value={current.label}
            placeholder="e.g. account email"
            maxLength={60}
            onChange={(v) => edit(patch(tl, "blurs", current.id, { label: v }), "Blur label")}
            hint="Only for your own list. Never write the secret itself here."
          />

          <Hint>Drag the rectangle on the preview to move it, and its corners to resize. Scrub through to check it stays over the thing the whole time.</Hint>
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
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 1));
    const c = { id: newId("q"), start, end: Math.min(tl.duration || start + 1.8, start + 1.8), text: "New caption", emphasis: [], custom: null };
    edit({ cues: [...cues, c], captions: { ...cap, enabled: true } }, "Add caption");
    onSelect({ kind: "cue", id: c.id });
  };

  const setCap = (fields, label) => edit({ captions: { ...cap, ...fields } }, label);
  const setOne = (fields, label) =>
    edit(patch(tl, "cues", current.id, { custom: { ...(current.custom || {}), ...fields } }), label);

  // What one line is actually drawn at, whether it was given a size of its own
  // or is following the track. The pixel field must never go blank.
  const lookOf = (cue) => {
    const size = cue?.custom?.size || cap.size || "m";
    const px = cue?.custom?.px ?? cap.px ?? null;
    return { size, px, shown: px != null ? px : Math.round((CAPTION_SIZES[size] || CAPTION_SIZES.m) * 1080) };
  };
  const track = lookOf(null);

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
              <CaptionLooks value={cap.style} color={cap.color || "#FFFFFF"} onChange={(v) => setCap({ style: v }, "Caption look")} />
            </div>
            <div>
              <Label>Colour</Label>
              <ColorPicker
                value={cap.color || "#FFFFFF"}
                keyId="all"
                onChange={(hex, key) => setCap({ color: hex === "#FFFFFF" ? null : hex }, key || "Caption colour")}
              />
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

      {current && (
        <Panel title="This line">
          <Field
            label="Text"
            multiline
            value={current.text}
            maxLength={300}
            onChange={(v) => edit(patch(tl, "cues", current.id, { text: v }), "Caption text")}
          />
          <Field
            label="Emphasise"
            value={(current.emphasis || []).join(", ")}
            placeholder="words that carry the meaning"
            onChange={(v) =>
              edit(
                patch(tl, "cues", current.id, { emphasis: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) }),
                "Caption emphasis"
              )
            }
            hint="Drawn in the look's accent colour. Usually the product name or the action."
          />
          <TimeRange tl={tl} item={current} time={time} onChange={(p) => edit(patch(tl, "cues", current.id, p), "Caption timing")} />

          <div>
            <Label>Just this line</Label>
            <div style={{ display: "grid", gap: 11, justifyItems: "start" }}>
              <ColorPicker
                compact
                value={current.custom?.color || cap.color || "#FFFFFF"}
                keyId={current.id}
                onChange={(hex, key) => setOne({ color: hex }, key || "Line colour")}
              />
              <SizePicker
                compact
                size={lookOf(current).size}
                px={lookOf(current).shown}
                min={CAPTION_PX.min}
                max={CAPTION_PX.max}
                onPreset={(v) => setOne({ size: v, px: null }, "Line size")}
                onPx={(px) => setOne({ px }, `px:${current.id}`)}
              />
              <CaptionLooks
                compact
                value={current.custom?.style || cap.style}
                color={current.custom?.color || cap.color || "#FFFFFF"}
                onChange={(v) => setOne({ style: v }, "Line look")}
              />
              <Toggle
                label="Bold"
                checked={current.custom?.bold !== false}
                onChange={(v) => setOne({ bold: v ? null : false }, "Line weight")}
              />
              {current.custom && (
                <Btn size="xs" icon={<Icon name="reset" size={12} />} onClick={() => edit(patch(tl, "cues", current.id, { custom: null }), "Reset line style")}>
                  Match the rest
                </Btn>
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

/**
 * The five caption looks, each tile drawn in its own look over a scrap of
 * picture — the same idea as the script editor's, with this product's styles.
 * A named list of styles tells a creator nothing; seeing "Sale leak" in Hormozi
 * yellow tells them everything.
 */
function CaptionLooks({ value, color, onChange, compact = false }) {
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
        const text = {
          fontWeight: look.weight,
          color: look.color === "#fff" ? color : look.color,
          textTransform: look.caps ? "uppercase" : "none",
          textShadow: look.shadow === "none" ? "none" : look.shadow,
          background: look.box ? "rgba(0,0,0,.6)" : "transparent",
          padding: look.box ? "1px 4px" : 0,
          borderRadius: look.box ? 3 : 0,
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
const STYLE_LABEL = { trylipi: "TryLipi", hormozi: "Bold", apple: "Quiet", minimal: "Minimal", neon: "Neon" };
/** Caption pixels are measured against a 1080-short-side frame. See render/ass.js. */
const CAPTION_PX = { min: 12, max: 96 };

/* ────────────────────────────────────────────────────────────────────────────
   Cursor
   ──────────────────────────────────────────────────────────────────────────── */

const CURSOR_MODE_HINT = {
  intent: "Built from the clicks in the recording: it rests on each control, travels to the next and arrives just before the press. Steadier than a real hand, and the pointer in the recording is reconstructed away underneath it.",
  recorded: "The pointer path recovered from the recording, smoothed. Use this when a demo is mostly scrolling or dragging, which a composed path does not describe.",
};

export function CursorPanel({ tl, edit }) {
  const cur = tl.cursor || {};
  const points = tl.track?.length || 0;
  const clicks = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick").length;

  return (
    <Panel title="Cursor">
      {points === 0 ? (
        <Empty icon="cursor" title="No pointer was recovered">
          The pointer is read back out of the recording's own pixels, and this one was too busy to read — a full-screen
          video or a constantly repainting page. Zooms and annotations still work.
        </Empty>
      ) : (
        <>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-mute)", marginTop: -4 }}>
            {clicks} click{clicks === 1 ? "" : "s"} detected, {points.toLocaleString()} points in the path.
          </div>
          <div>
            <Label>Path</Label>
            <Segmented
              full
              size="xs"
              value={cur.mode === "intent" ? "intent" : "recorded"}
              onChange={(v) => edit({ cursor: { ...cur, mode: v } }, v === "intent" ? "Composed pointer" : "Recorded pointer")}
              options={[
                { value: "intent", label: "Composed" },
                { value: "recorded", label: "As recorded" },
              ]}
            />
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-mute)", marginTop: 6 }}>
              {CURSOR_MODE_HINT[cur.mode === "intent" ? "intent" : "recorded"]}
            </div>
          </div>
          <Toggle
            label="Draw a clean cursor"
            hint="A drawn pointer over the captured one, so it stays sharp inside a zoom."
            checked={cur.enabled !== false}
            onChange={(v) => edit({ cursor: { ...cur, enabled: v } }, v ? "Cursor on" : "Cursor off")}
          />
          {cur.enabled !== false && (
            <>
              <div>
                <Label>Look</Label>
                <Segmented
                  full
                  size="xs"
                  value={cur.theme}
                  onChange={(v) => edit({ cursor: { ...cur, theme: v } }, "Cursor look")}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "ring", label: "Ring" },
                    { value: "dot", label: "Dot" },
                  ]}
                />
              </div>
              <Slider
                label="Size"
                min={0.8}
                max={2.2}
                step={0.05}
                value={cur.size ?? 1.35}
                onChange={(v) => edit({ cursor: { ...cur, size: v } }, "Cursor size")}
                format={(v) => `${v.toFixed(2)}×`}
                hint={
                  (cur.size ?? 1.35) < 1.15
                    ? "Below about 1.2× the captured pointer shows from underneath the drawn one. It cannot be erased from the recording."
                    : undefined
                }
              />
              <Slider
                label="Glow"
                min={0}
                max={1}
                step={0.05}
                value={cur.glow ?? 0.35}
                onChange={(v) => edit({ cursor: { ...cur, glow: v } }, "Cursor glow")}
                format={pct}
              />
              <Slider
                label="Trail"
                min={0}
                max={1}
                step={0.05}
                value={cur.trail ?? 0}
                onChange={(v) => edit({ cursor: { ...cur, trail: v } }, "Cursor trail")}
                format={(v) => (v === 0 ? "Off" : pct(v))}
                hint="Reads as speed on a fast move and as a mess on a slow one. Most demos are slow moves."
              />
              <Toggle
                label="Ripple on click"
                hint="A click is invisible in a screen recording — the button changes for eighty milliseconds and the viewer misses it."
                checked={cur.ripple !== false}
                onChange={(v) => edit({ cursor: { ...cur, ripple: v } }, "Click ripple")}
              />
            </>
          )}
        </>
      )}
    </Panel>
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
          The edit was read back and nothing stood out.
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
    </Panel>
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
 */
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
