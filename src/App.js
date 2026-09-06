import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import api from "./api";
import LandingPage from "./components/Landing/LandingPage";
import Dashboard from "./components/Dashboard/Dashboard";
import CategoryPicker from "./components/Onboarding/CategoryPicker";
import PrivacyPolicy from "./components/Legal/PrivacyPolicy";
import Terms from "./components/Legal/Terms";
import RefundPolicy from "./components/Legal/RefundPolicy";
import ShippingPolicy from "./components/Legal/ShippingPolicy";
import Contact from "./components/Legal/Contact";

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
    } catch {
      setUser(null); // 401 is the normal signed-out case, not an error worth showing
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
        <Routes>
          <Route
            path="/"
            element={
              resolved && user
                ? <Navigate to="/app" replace />
                : <LandingPage onSignedIn={(u) => setUser(u)} checking={!resolved} />
            }
          />
          {/* Each screen owns a URL, so back/forward work, a tab can be linked to
              and a refresh lands where you were. `/app` alone redirects rather
              than rendering, so there is exactly one address per screen. */}
          <Route path="/app" element={<Navigate to="/app/topics" replace />} />

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
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/refunds" element={<RefundPolicy />} />
          <Route path="/shipping" element={<ShippingPolicy />} />
          <Route path="/contact" element={<Contact />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

function Booting() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--ink-mute)", fontSize: 14 }}>
      Loading…
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
