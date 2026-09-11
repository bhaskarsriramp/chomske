import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";

/**
 * /v/:slug — the door, and nothing else.
 *
 * ── WHY THIS RENDERS ALMOST NOTHING ──────────────────────────────────────────
 * The first version of this was a whole bespoke page: its own intro, its own
 * topic list, its own script view. It worked, and it was the wrong shape. A
 * creator opening it saw a demo of a product that did not exist, because the
 * real app has a sidebar, a channel switcher, an ordering screen with a
 * duration slider and a credits card, and none of that was on the demo.
 *
 * The point of a showcase is to show somebody what they would actually get. So
 * this route now does one job: trade the slug for a session, then hand over to
 * the real app at /app/analysis. Everything after that is the same shell, the
 * same feed and the same script writer a paying creator uses, with the controls
 * they have not earned yet swapped for an invitation to sign up.
 *
 * The only thing kept from the old page is this: the page must say plainly what
 * it is before it says anything else. That now lives in AnalysisPanel, the first
 * screen they land on.
 */
export default function ShowcaseEntry() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  /* Keep this out of search. The API sends X-Robots-Tag, but the HTML at
     /v/:slug comes from the static host, which knows nothing about this route.
     The page carries a real person's name: sent privately to them it is a
     courtesy they can end at any time, indexed by Google it is public use of
     their identity that they never agreed to. Also add the header for /v/* at
     the static host, because a crawler that skips our JavaScript never sees
     this tag. */
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.post(`/v/${slug}/open`);
        if (cancelled) return;
        // replace, not push: the back button should leave the app, not drop
        // them onto a door they have already walked through.
        navigate("/app/analysis", { replace: true });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "This link isn't active any more."));
      }
    })();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper, #FAFAF8)", padding: "44px clamp(20px, 6vw, 90px)" }}>
      <div style={{ marginBottom: 34 }}><Logo size={28} fontSize={16} /></div>
      {error ? (
        <>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 10px" }}>
            This link isn't active.
          </h1>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-body)", margin: 0 }}>
            {error} It may have expired, been turned off, or already been claimed.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 15.5, color: "var(--ink-body)" }}>Opening…</p>
      )}
    </div>
  );
}
