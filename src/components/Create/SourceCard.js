/**
 * SourceCard: exactly what we hold, before a single credit moves.
 *
 * ── THE POINT OF THIS COMPONENT ──────────────────────────────────────────────
 * Discover never needed one. A ranked story arrives with a brief and a coverage
 * list, so a creator reads what the story is and then decides. Import and Idea
 * have no such thing, and without this they would be pressing a paid button over
 * material they have only assumed we could read.
 *
 * That assumption breaks constantly and quietly. Publishers block crawlers, so
 * five pasted links routinely become two readable ones. A brief about something
 * with no coverage finds nothing. Both cases produce a working script, just a
 * much thinner one than the creator was picturing, and discovering that after
 * paying is how a product earns a refund request.
 *
 * So every row here is a fact, including the unflattering ones: the links that
 * refused, the lookup that came back empty. A screen that only reported
 * successes would be worse than useless, because it would be trusted.
 */
export default function SourceCard({ source, onChange, compact }) {
  if (!source) return null;

  const {
    kind, youtube, links = [], text_chars: textChars = 0,
    lookup, lookup_used: lookupUsed, draft_approved_at: approved,
  } = source;
  const readable = links.filter((l) => l.ok);
  const refused = links.filter((l) => !l.ok);

  return (
    <div
      className="hg-rise"
      style={{
        border: "1px solid var(--made-line)", background: "var(--made-tint)",
        borderRadius: "var(--radius)", overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--made-line)",
        }}
      >
        <span
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--ink-mute)",
          }}
        >
          What we'll write from
        </span>
        {onChange && (
          <button
            onClick={onChange}
            className="hg-btn-ghost"
            style={{
              fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 8,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer", flexShrink: 0,
            }}
          >
            Change
          </button>
        )}
      </div>

      <div style={{ padding: compact ? 14 : 16, display: "grid", gap: 12 }}>
        {youtube && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {youtube.thumbnail && (
              <img
                src={youtube.thumbnail}
                alt=""
                width={96}
                height={54}
                style={{
                  width: 96, height: 54, objectFit: "cover", borderRadius: 8,
                  border: "1px solid var(--line)", flexShrink: 0, background: "var(--line)",
                }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}
              >
                {youtube.title || "YouTube video"}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 3 }}>
                {youtube.channel ? `${youtube.channel} · ` : ""}
                {fmtDuration(youtube.duration_seconds)}
                {/* Reading is bought once. Saying so here is what makes the
                    cheaper price on the second order make sense rather than
                    look like a pricing glitch. */}
                {youtube.already_read && " · already read"}
              </div>
            </div>
          </div>
        )}

        {readable.length > 0 && (
          <Row
            ok
            label={`${readable.length} page${readable.length === 1 ? "" : "s"} read`}
            detail={readable.map((l) => l.source).filter(Boolean).join(", ")}
          />
        )}

        {/* ── THE ROW THAT EARNS THIS COMPONENT ─────────────────────────────
            Named, not counted. "2 pages couldn't be read" makes somebody hunt
            through their own tabs to work out which; naming the outlets means
            they can decide in a second whether it matters, and paste a
            different link if it does. */}
        {refused.length > 0 && (
          <Row
            label={`Couldn't read ${refused.length} link${refused.length === 1 ? "" : "s"}`}
            detail={`${refused.map((l) => l.source).filter(Boolean).join(", ")} blocked us. Usually a paywall.`}
          />
        )}

        {textChars > 0 && !approved && (
          <Row ok label={`${textChars.toLocaleString()} characters pasted`} detail="Used as source material." />
        )}

        {/* ── Idea mode's verdict ───────────────────────────────────────────
            The most important row on that screen, because it says which kind
            of script is about to be written. A creator who believes we
            researched their topic, when in fact they approved a draft written
            from a model's training, would find out by reading it aloud. */}
        {lookup && lookupUsed && (
          <Row ok label="Found real coverage" detail="Facts come from the sources we found, and they're listed with the script." />
        )}

        {/* ── WHAT THEY SIGNED OFF ON ───────────────────────────────────────
            This used to read "No coverage found. We'll write from your brief
            alone", which was a dead end wearing a warning icon: it announced a
            failure and then wrote sixty seconds out of one sentence anyway.

            There is no failure here. An evergreen explainer has no coverage
            today or ever, so we draft the content, the creator checks it, and
            what the script gets written from is the version they approved.
            That is a better outcome than the search hitting, and the row
            should read like one. */}
        {approved && (
          <Row
            ok
            label="Your checked draft"
            detail={
              `${textChars.toLocaleString()} characters you read and approved. The script says this, in your voice.` +
              (lookup && !lookupUsed ? " No news coverage on this one, so the lookup wasn't charged." : "")
            }
          />
        )}

        {/* ── ONLY IDEA CAN BE UNGROUNDED ──────────────────────────────────
            The fallback when drafting itself failed, so there is genuinely
            nothing but the brief. Gated on the kind, not on `grounded`: a
            video-only Import is reported as ungrounded because its transcript
            is not read until somebody pays, and keying off that would have
            this row promise a brief on a screen where none was written. An
            Import with nothing readable never reaches this component at all,
            the server refuses it during the preview. */}
        {kind === "idea" && !approved && !lookupUsed && (
          <Row
            ok
            label="Writing from your brief"
            detail="Your words, your voice, at the length you pick. We won't add facts of our own."
          />
        )}
      </div>
    </div>
  );
}

/**
 * One line of what we hold.
 *
 * A refusal is grey rather than red on purpose. A paywalled link is a normal
 * fact about the web, not a fault the creator caused or needs to fix, and a red
 * box would read as "something has gone wrong" over a source set that is
 * usually perfectly good.
 */
function Row({ ok, label, detail }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <span
        aria-hidden="true"
        style={{
          width: 15, height: 15, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          display: "grid", placeItems: "center",
          fontSize: 10, fontWeight: 700, lineHeight: 1,
          color: "#fff", background: ok ? "var(--ok)" : "#A6A6A6",
        }}
      >
        {ok ? "✓" : "!"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55, marginTop: 2 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDuration(seconds) {
  const n = Math.round(Number(seconds) || 0);
  if (!n) return "";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${m}m ${String(rest).padStart(2, "0")}s` : `${m} min`;
}
