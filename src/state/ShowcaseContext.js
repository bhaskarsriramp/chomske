import { createContext, useContext, useState, useCallback, useMemo } from "react";
import SignUpDialog from "../components/Showcase/SignUpDialog";

/**
 * Is this a showcase visitor, and how do we ask them to sign up?
 *
 * ── WHY A CONTEXT AND NOT A PROP ─────────────────────────────────────────────
 * The invitation has to be reachable from four unrelated places: the credits
 * card in the rail, the credits pill in the mobile header, My voice when they
 * try to change the videos, and the ordering screen when a generation is
 * refused for want of credits. Threading an `onSignUp` callback down four
 * different trees would mean four chances to forget it, and a forgotten one is
 * a dead button on the only screen that converts.
 *
 * ── AND WHY THE FLAG LIVES HERE TOO ──────────────────────────────────────────
 * `isShowcase` decides what a dozen components DRAW, never what they may do.
 * The server already refuses a showcase session everywhere it matters
 * (middleware/authenticateToken.js defaults to denying it), so nothing here is
 * a security boundary and nothing downstream should treat it as one. It exists
 * so the app can offer a sign-up where it would otherwise offer a control that
 * is about to 403.
 */
const Ctx = createContext({
  isShowcase: false,
  showcase: null,
  openSignUp: () => {},
});

export function useShowcase() {
  return useContext(Ctx);
}

export default function ShowcaseProvider({ user, children }) {
  const isShowcase = user?.kind === "showcase";
  const [reason, setReason] = useState("");

  // The reason doubles as the open flag: there is no state in which the dialog
  // is open without knowing why, and the heading changes with it, so one piece
  // of state cannot disagree with itself.
  const openSignUp = useCallback((why = "") => setReason(why || "generic"), []);
  const close = useCallback(() => setReason(""), []);

  const value = useMemo(
    () => ({ isShowcase, showcase: user?.showcase || null, openSignUp }),
    [isShowcase, user?.showcase, openSignUp]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {isShowcase && (
        <SignUpDialog
          open={Boolean(reason)}
          reason={reason}
          onClose={close}
          showcaseId={user?.id}
        />
      )}
    </Ctx.Provider>
  );
}
