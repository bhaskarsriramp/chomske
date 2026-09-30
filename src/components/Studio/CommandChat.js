/**
 * CommandChat.js: the editor's chat. The creator types what they want ("zoom
 * in on Projects", "remove the zooms in the first 10 seconds") and the edit is
 * made on the timeline, the same edit they could have made by hand.
 *
 * ── WHAT THE RESEARCH SAID, AND WHERE IT IS IN THIS FILE ─────────────────────
 * (2026-09-30.) Every chat editor on the market draws the same complaints: it
 * does the wrong thing confidently, it doesn't say what it did, and an empty
 * text box gives no idea what it can do. So:
 *   • every answer that changed something says what, with times, and carries
 *     its own Undo. That Undo takes back only its own change, so it still
 *     works after other edits have been made since;
 *   • the change is selected, so it shows on the preview and the timeline,
 *     not only in words here;
 *   • the panel opens with examples, and says what "here" and "this" mean at
 *     this moment (the playhead, the selected zoom): context a creator should
 *     not have to type;
 *   • a question comes as buttons, never as a request to type it all again.
 *
 * The server works out WHAT to change (backend services/studio/command.js);
 * the editor makes the change (StudioEditor applyCommand), through the same
 * edit() as everything else, so it autosaves and Ctrl+Z undoes it too.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onLiveEvent } from "../../realtime/socket";
import { sendCommand, commandUndone } from "./studioApi";
import { Drawer, Icon } from "./ui";
import { fmtTime } from "./model";

let seq = 0;
const nextId = () => `m${++seq}`;

/** How much of the conversation goes with a message, so "the other one" means something. */
const HISTORY = 6;

export default function CommandChat({ demoId, tl, time, total, selection, onApply, onUndo, onFollow, onSelect, onSeek }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // What the server says it is doing for the message in flight: "Looking at
  // the frame at 0:15.7…". Sent over the live channel with the message's own id.
  const [status, setStatus] = useState("");
  const pending = useRef("");
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const fabRef = useRef(null);
  const wasOpen = useRef(false);

  // Read when a message is SENT, so the request carries what the editor has
  // then (the playhead after a scrub, a zoom selected a moment ago), not what
  // it had when this component last rendered.
  const live = useRef({});
  live.current = { tl, time, selection };
  const msgsRef = useRef(messages);
  msgsRef.current = messages;

  const push = useCallback((m) => setMessages((p) => [...p, { id: nextId(), ...m }]), []);
  const patchMsg = useCallback((id, change) => setMessages((p) => p.map((m) => (m.id === id ? { ...m, ...change } : m))), []);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    // Closed: focus goes back to the button that opened it.
    if (wasOpen.current) fabRef.current?.focus();
    return undefined;
  }, [open]);

  // The newest message in view, inside the drawer's own scroll.
  useEffect(() => {
    const body = endRef.current?.closest(".st-drawer-body");
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, busy, status, open]);

  useEffect(
    () =>
      onLiveEvent("studio:update", (e) => {
        if (e?.command?.rid && e.command.rid === pending.current) setStatus(String(e.command.status || ""));
      }),
    []
  );

  // The box grows with what is typed, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft, open]);

  const undoMessage = useCallback(
    (m, how) => {
      if (!m?.undo || m.undone) return false;
      if (!onUndo(m.undo)) return false;
      patchMsg(m.id, { undone: true });
      if (m.cid) commandUndone(demoId, m.cid, how).catch(() => {});
      return true;
    },
    [demoId, onUndo, patchMsg]
  );

  const run = useCallback(
    async ({ text, intent, shown, from }) => {
      const { tl: cur, time: t, selection: sel } = live.current;
      if (!cur) return;
      const history = msgsRef.current
        .filter((m) => m.text)
        .slice(-HISTORY)
        .map((m) => ({ role: m.role, text: m.text }));
      push({ role: "user", text: shown || text });
      const rid = `${nextId()}-${Math.random().toString(36).slice(2, 10)}`;
      pending.current = rid;
      setStatus("");
      setBusy(true);
      try {
        const res = await sendCommand(demoId, {
          ...(intent ? { intent } : { text }),
          rid,
          playhead: t,
          selected: sel?.kind === "zoom" ? sel.id : null,
          selectedBlur: sel?.kind === "blur" ? sel.id : null,
          blurs: (cur.blurs || []).map(({ id, x, y, w, h, at, start, end, kind, label, auto }) => ({ id, x, y, w, h, at, start, end, kind, label, auto })),
          zooms: (cur.zooms || []).map(({ id, start, end, x, y, w, h, level, label, auto, easing, ease_out, ramp_in, ramp_out }) => ({
            id, start, end, x, y, w, h, level, label, auto, easing, ease_out, ramp_in, ramp_out,
          })),
          cuts: (cur.cuts || []).map(({ start, end }) => ({ start, end })),
          history,
        });

        if (res.kind === "undo") {
          const last = [...msgsRef.current].reverse().find((m) => m.undo && !m.undone && !m.replaced);
          if (last && undoMessage(last, "typed")) push({ role: "app", text: "Undone. The timeline is back to how it was before that change." });
          else push({ role: "app", text: "There's no change of mine to undo. Use Undo at the top for other edits." });
          return;
        }

        if (res.kind === "applied") {
          const ops = res.ops || {};
          const label = ops.addBlurs?.length
            ? "Chat: add blur"
            : ops.removeBlurs?.length
              ? "Chat: remove blur"
              : ops.add?.length
                ? "Chat: add zoom"
                : "Chat: remove zoom";
          const made = onApply(ops, label);
          if (!made) {
            push({ role: "app", text: "The timeline changed while I was working, so there was nothing left to change. Try again." });
            return;
          }
          // A blur is applied the moment it is made, exactly as the Apply
          // button does it: followed through the recording from its frame.
          const { newBlurs = [], ...undo } = made;
          for (const b of newBlurs) onFollow?.(b);
          // Picking another moment replaced the zoom the earlier answer added;
          // that answer's Undo would now undo the wrong thing.
          if (from) patchMsg(from, { replaced: true });
          push({ role: "app", text: res.reply, undo, cid: res.cid, choices: res.choices || [] });
          const removedSelected =
            (sel?.kind === "zoom" && (ops.remove || []).includes(sel.id)) || (sel?.kind === "blur" && (ops.removeBlurs || []).includes(sel.id));
          if (res.select) onSelect({ kind: res.selectKind || "zoom", id: res.select });
          else if (removedSelected) onSelect(null);
          if (res.seek != null) onSeek(res.seek);
          return;
        }

        push({ role: "app", text: res.reply, cid: res.cid, choices: res.choices || [], tone: res.kind === "error" ? "error" : undefined });
      } catch (err) {
        push({
          role: "app",
          tone: "error",
          text: err?.response?.data?.message || "I couldn't reach the server. Check your connection and try again.",
        });
      } finally {
        pending.current = "";
        setStatus("");
        setBusy(false);
      }
    },
    [demoId, onApply, onFollow, onSelect, onSeek, patchMsg, push, undoMessage]
  );

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    run({ text });
  };

  const pick = (m, c) => {
    if (busy) return;
    patchMsg(m.id, { picked: true });
    // Only a button that takes the earlier answer's edit away ("use the click
    // at 0:31 instead") retires that answer's Undo; "find it everywhere" adds
    // to it and leaves it be.
    run({ intent: c.intent, shown: c.label, from: m.undo && c.intent?.replace?.length ? m.id : null });
  };

  // ── What to try: real names from this recording where there are some ──────
  const zooms = tl?.zooms || [];
  const sorted = [...zooms].sort((a, b) => a.start - b.start);
  const selIndex = selection?.kind === "zoom" ? sorted.findIndex((z) => z.id === selection.id) : -1;
  const selBlur = selection?.kind === "blur" ? (tl?.blurs || []).find((b) => b.id === selection.id) : null;
  const named = sorted.find((z) => z.label && z.label.length <= 24)?.label;
  const from = Math.floor((total || 0) * 0.2);
  const examples = [
    named ? `Zoom in on ${named}` : "Zoom in here",
    total > 12 ? `Add a zoom from ${fmtTime(from)} to ${fmtTime(from + 5)}` : "Add a zoom from 0:01 to 0:04",
    "Blur the email address here",
    "Blur the API key with a black box",
    total > 20 ? "Remove the zooms in the first 10 seconds" : "Remove all zooms",
  ];

  const footer = (
    <div className="st-chat-foot">
      <div className="st-chat-context" aria-live="polite">
        Playhead {fmtTime(time, true)}
        {selIndex >= 0 ? ` · Zoom ${selIndex + 1} selected` : ""}
        {selBlur ? ` · Blur${selBlur.label ? ` on “${selBlur.label}”` : ""} selected` : ""}
      </div>
      <form
        className="st-chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          id="st-chat-input"
          ref={inputRef}
          className="st-chat-input"
          rows={1}
          value={draft}
          maxLength={400}
          placeholder="Try “zoom in on Projects”"
          aria-label="What should change?"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className="st-chat-send" disabled={busy || !draft.trim()} aria-label="Send" title="Send (Enter)">
          <Icon name="send" size={15} />
        </button>
      </form>
    </div>
  );

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          type="button"
          className="st-chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Edit with a message"
          title="Edit with a message"
        >
          <Icon name="chat" size={22} />
        </button>
      )}
      <Drawer open={open} title="Edit with a message" sub="Adds and removes zooms and blurs" onClose={() => setOpen(false)} footer={footer}>
        <div className="st-chat-log">
          {!messages.length && (
            <div className="st-chat-intro">
              <p>
                Tell me what to zoom in on or what to hide, and I'll make the edit on the timeline. Name a button, or describe what you
                see, like “the image with the play button” or “my email in the top corner”. Anything I do can be undone.
              </p>
              <div className="st-chat-examples" aria-label="Examples">
                {examples.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="st-chat-chip"
                    onClick={() => {
                      setDraft(e);
                      inputRef.current?.focus();
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const showChoices = m.role === "app" && !m.picked && !m.undone && !m.replaced && m.choices?.length > 0;
            const showUndo = m.role === "app" && m.undo && !m.undone && !m.replaced;
            return (
              <div
                key={m.id}
                className={`st-chat-msg ${m.role === "user" ? "is-user" : "is-app"}${m.tone === "error" ? " is-error" : ""}`}
              >
                <div className="st-chat-text">{m.text}</div>
                {(showUndo || showChoices) && (
                  <div className="st-chat-actions">
                    {showUndo && (
                      <button type="button" className="st-chat-chip is-undo" onClick={() => undoMessage(m, "button")}>
                        <Icon name="undo" size={12} />
                        Undo
                      </button>
                    )}
                    {showChoices &&
                      m.choices.map((c, i) => (
                        <button key={i} type="button" className="st-chat-chip is-choice" disabled={busy} onClick={() => pick(m, c)}>
                          {c.label}
                        </button>
                      ))}
                  </div>
                )}
                {m.undone && <div className="st-chat-note">Undone</div>}
                {m.replaced && <div className="st-chat-note">Replaced by your choice below</div>}
              </div>
            );
          })}

          {busy && (
            <div className="st-chat-msg is-app st-chat-working" role="status" aria-label={status || "Working"}>
              <span className="st-chat-typing" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {status && <span className="st-chat-status">{status}</span>}
            </div>
          )}
          <div ref={endRef} aria-hidden />
        </div>
      </Drawer>
    </>
  );
}
