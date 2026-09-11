import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";
import Skeleton from "../Shell/Skeleton";

/**
 * /v/:slug: the door, and nothing else.
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
export default function ShowcaseEntry({ onOpened }) {
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

        // ── RE-READ THE SESSION BEFORE MOVING ─────────────────────────────
        // The cookie only came into existence a line ago. App resolved
        // /auth/me at first paint, when this visitor had no session at all,
        // and still holds `user: null`. Navigating on that stale value sends
        // them to /app/analysis, which sees a null user and redirects to the
        // landing page: a valid link, a valid session, and the front door.
        //
        // Awaited, so the state update is queued before the navigation that
        // reads it. React applies both in one render, in that order.
        await onOpened?.();
        if (cancelled) return;

        // replace, not push: the back button should leave the app, not drop
        // them onto a door they have already walked through.
        navigate("/app/analysis", { replace: true });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "This link isn't active any more."));
      }
    })();
    return () => { cancelled = true; };
  }, [slug, navigate, onOpened]);

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
        /* ── WHAT A SLOW CONNECTION SEES ──────────────────────────────────
           Three things happen before the real screen can render: the slug is
           traded for a session, /auth/me is re-read, and the app's chunk is
           fetched. On a phone on a weak connection that is seconds, and the
           word "Opening…" on a white page for seconds reads as broken.

           So the wait is shaped like the destination: the same headline, the
           same stat grid, the same detail rows AnalysisPanel is about to draw.
           Nothing jumps when it arrives, and the page looks like it is working
           rather than like it has failed. */
        <div style={{ maxWidth: 980 }}>
          <Skeleton variant="text" width="70%" height={42} />
          <div style={{ height: 14 }} />
          <Skeleton variant="text" width="86%" height={14} />
          <Skeleton variant="text" width="62%" height={14} />

          <div
            style={{
              display: "grid", gap: 13, marginTop: 30,
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  background: "var(--card, #fff)", border: "1px solid var(--line, #E3E3E3)",
                  borderRadius: 14, padding: "16px 17px",
                }}
              >
                <Skeleton variant="text" width="58%" height={10} />
                <div style={{ height: 8 }} />
                <Skeleton variant="text" width="74%" height={24} />
              </div>
            ))}
          </div>

          {[0, 1].map((i) => (
            <div key={i} style={{ marginTop: 25 }}>
              <Skeleton variant="text" width={168} height={10} />
              <div style={{ height: 8 }} />
              <Skeleton variant="text" width="92%" height={14} />
              <Skeleton variant="text" width="70%" height={14} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
