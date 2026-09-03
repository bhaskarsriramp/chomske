import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import api from "./api";
import LandingPage from "./components/Landing/LandingPage";
import Dashboard from "./components/Dashboard/Dashboard";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

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
          <Route
            path="/app"
            element={
              !resolved ? <Booting />
                : user ? <Dashboard user={user} onSignOut={signOut} />
                : <Navigate to="/" replace />
            }
          />
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

/** A missing client id breaks sign-in in a way that's invisible at runtime — say so. */
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
