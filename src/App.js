import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import api from "./api";
import LandingPage from "./components/Landing/LandingPage";
// Eager, not lazy: it is what stands in for every lazy chunk, so loading it
// behind a chunk boundary would mean nothing to show during the wait it exists
// to cover. Roughly a kilobyte.
import Skeleton from "./components/Shell/Skeleton";

/* ── WHAT IS SPLIT, AND WHY ──────────────────────────────────────────────────
   A stranger arriving at trylipi.online sees exactly one screen: the landing
   page. Before this split they downloaded, parsed and executed all of it:
   the dashboard, the news feed, the transcriber, the script editor, the
   billing dialog, the legal pages, and socket.io-client, to read a headline
   and press one button. That is most of a ~490KB bundle spent on screens the
   visitor may never open, and parse time is worse than download time on a
   mid-range phone.

   So: the landing page is imported eagerly, because it IS the first paint and
   making it lazy would only add a round trip in front of it. Everything behind
   the sign-in wall, plus the legal pages, is a separate chunk fetched when
   somebody actually navigates there.

   Suspense boundaries fall back to <Booting/>, the same "Loading…" the app
   already showed while the session check was in flight, so a chunk fetch is
   indistinguishable from the wait that was always there. */
const Dashboard = lazy(() => import("./components/Dashboard/Dashboard"));
const CategoryPicker = lazy(() => import("./components/Onboarding/CategoryPicker"));
const PrivacyPolicy = lazy(() => import("./components/Legal/PrivacyPolicy"));
const Terms = lazy(() => import("./components/Legal/Terms"));
const RefundPolicy = lazy(() => import("./components/Legal/RefundPolicy"));
const ShippingPolicy = lazy(() => import("./components/Legal/ShippingPolicy"));
const Contact = lazy(() => import("./components/Legal/Contact"));

// Both are lazy for the same reason as everything above: a visitor to the
// landing page must not download the admin workbench, and a creator opening a
// private demo link must not download the dashboard.
const AdminPanel = lazy(() => import("./components/Admin/AdminPanel"));
const ShowcaseEntry = lazy(() => import("./components/Showcase/ShowcaseEntry"));

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "341385315335-6p5l9nqi7hrm953k4ucr48gr2fvpq6eu.apps.googleusercontent.com";

export default function App() {
  // null = still checking. Distinguishing "unknown" from "signed out" is what
  // stops the landing page flashing before a signed-in user lands on the app.
  const [user, setUser] = useState(null);
  const [resolved, setResolved] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data?.user || null);
      // A signed-in visitor is about to be redirected into the app, so start
      // its chunk NOW rather than after the redirect renders. Without this the
      // split would trade a faster landing page for a slower return visit;
      // with it the download overlaps the render we were doing anyway.
      if (data?.user) warmAppChunks();
    } catch {
      // Reaching here now means the request genuinely failed: offline, or the
      // API is down. Being signed out is NOT this branch: /auth/me answers 200
      // with `user: null` for an anonymous visitor, precisely so the front door
      // stops logging a console error on every first visit. Landing on the
      // landing page is still the right thing to do either way.
      setUser(null);
    } finally {
      setResolved(true);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const signOut = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* clearing local state matters more */ }
    setUser(null);
  }, []);

  if (!GOOGLE_CLIENT_ID) return <ConfigError />;

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Suspense fallback={<Booting />}>
          <Routes>
            <Route
              path="/"
              element={
                resolved && user
                  ? <Navigate to="/app" replace />
                  : <LandingPage onSignedIn={(u) => { setUser(u); warmAppChunks(); }} checking={!resolved} />
              }
            />
            {/* Each screen owns a URL, so back/forward work, a tab can be linked to
                and a refresh lands where you were. `/app` alone redirects rather
                than rendering, so there is exactly one address per screen. */}
            <Route path="/app" element={<Navigate to="/app/discover" replace />} />

            {/* The category picker replaces the app rather than overlaying it.
                Until it is answered there is nothing to collect and nothing to
                show, so letting someone reach an empty dashboard would only teach
                them the product is broken. No route goes past it. */}
            <Route
              path="/app/:tab"
              element={
                !resolved ? <Booting />
                  : !user ? <Navigate to="/" replace />
                    : !user.onboarded
                      ? <CategoryPicker user={user} onDone={setUser} onSignOut={signOut} />
                      : <Dashboard user={user} onSignOut={signOut} />
              }
            />
            {/* ── Public, and deliberately above the auth gate ─────────────────
                A payment provider verifying us, a creator deciding whether to buy,
                and somebody chasing a refund all need these, and none of them
                should have to sign in to read our terms. They are also opened in
                a new tab from the footer, so each one is a real address that
                works cold, with no app state behind it. */}
            {/* ── The private outreach demo ─────────────────────────────────
                Deliberately outside the auth gate: the slug IS the credential,
                and the entire point is that a creator we emailed cold does not
                have to create an account to see what we built for them. The
                server scopes what that session can reach; see
                middleware/authenticateToken.js. */}
            {/* onOpened re-reads /auth/me before the redirect. Without it the
                redirect lands on /app/:tab while `user` is still the null this
                app resolved at first paint, seconds before the showcase cookie
                existed, and that route sends a null user back to the landing
                page. The link opened, the session was valid, and the visitor
                was bounced to the front door anyway. */}
            <Route path="/v/:slug" element={<ShowcaseEntry onOpened={refreshUser} />} />

            {/* Gated server-side, not here. This route renders "Not found" for
                anyone whose /admin/me check fails, and every endpoint behind it
                answers 404 without the flag, so the route existing in the
                bundle gives nothing away. */}
            <Route path="/admin" element={<AdminPanel />} />

            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refunds" element={<RefundPolicy />} />
            <Route path="/shipping" element={<ShippingPolicy />} />
            <Route path="/contact" element={<Contact />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

/**
 * Pull the app's chunks down ahead of the navigation that needs them.
 *
 * Fire-and-forget on purpose: React.lazy caches the module promise, so calling
 * this early just means the later render finds the chunk already there. A
 * rejection here is not an error anyone should see: if the chunk is genuinely
 * unreachable, the real import at render time will surface it.
 */
let warmed = false;
function warmAppChunks() {
  if (warmed) return;
  warmed = true;
  import("./components/Dashboard/Dashboard").catch(() => {});
  import("./components/Onboarding/CategoryPicker").catch(() => {});
}

/**
 * What is on screen while a chunk downloads, or while /auth/me is in flight.
 *
 * ── WHY THIS IS NOT THE WORD "LOADING" ANY MORE ──────────────────────────────
 * It was, centred on white. That is fine on a fast connection, where it flashes
 * for 80ms, and it is the wrong thing on a mid-range phone on a weak Indian
 * network, where the app chunk takes seconds: a nearly blank page with one
 * small grey word on it reads as broken, and somebody who thinks a page is
 * broken closes it before it can finish.
 *
 * A skeleton cannot be misread as a failure. It is deliberately generic rather
 * than a copy of the app shell, because this fallback also covers the legal
 * pages and the showcase door, and a left navigation rail drawn in front of a
 * privacy policy would be a different kind of lie.
 */
function Booting() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper, #FAFAF8)", padding: "44px clamp(20px, 6vw, 90px)" }}>
      <div style={{ maxWidth: 760 }}>
        <Skeleton variant="rectangular" width={104} height={26} style={{ borderRadius: 7 }} />
        <div style={{ height: 34 }} />
        <Skeleton variant="text" width="66%" height={34} />
        <div style={{ height: 16 }} />
        <Skeleton variant="text" width="88%" height={13} />
        <Skeleton variant="text" width="74%" height={13} />
        <div style={{ height: 30 }} />
        <Skeleton variant="rectangular" height={92} />
        <div style={{ height: 12 }} />
        <Skeleton variant="rectangular" height={92} />
      </div>
    </div>
  );
}

/** A missing client id breaks sign-in in a way that's invisible at runtime. Say so. */
function ConfigError() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>
          Missing Google client ID
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)" }}>
          Set <code>REACT_APP_GOOGLE_CLIENT_ID</code> in <code>.env</code> (copy it from
          <code> .env.example</code>) and restart the dev server. It must match
          <code> GOOGLE_CLIENT_ID</code> in the backend.
        </p>
      </div>
    </div>
  );
}
