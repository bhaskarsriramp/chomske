import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api";
import BuyCredits, { countryHint } from "../components/Billing/BuyCredits";

/**
 * One balance, one buy dialog, for the whole app.
 *
 * The balance is now shown in three places at once (the sidebar card, the order
 * panel and the mobile header) and they have to agree. Three components each
 * fetching their own copy is three numbers that drift apart the moment a script
 * is generated, and the one a creator believes is whichever they happen to be
 * looking at.
 *
 * The buy dialog is mounted here for the same reason: it is opened from the
 * sidebar, from the order panel and from the "not enough credits" state, and
 * three copies of a payment flow is three chances to get a payment flow wrong.
 */
const Ctx = createContext(null);

// A provider-less fallback rather than a thrown error. A missing provider should
// degrade to "no balance shown", not blank the screen someone is working on.
const FALLBACK = {
  balance: null,
  rules: null,
  trial: null,
  purchased: null,
  refresh: () => {},
  setBalance: () => {},
  openBuy: () => {},
  canBuy: false,
};

export function useCredits() {
  return useContext(Ctx) || FALLBACK;
}

export default function CreditsProvider({ children }) {
  const [balance, setBalance] = useState(null);   // null = not known yet
  const [rules, setRules] = useState(null);       // packs + pricing, from the server
  // The free first video (backend videoBilling.js): { available, demo, paid, seconds }.
  const [trial, setTrial] = useState(null);
  // Whether this account has ever bought credits. Until it has, the balance is
  // not shown: a first-time creator is never greeted with "0 credits".
  const [purchased, setPurchased] = useState(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/wallet");
      if (typeof data?.balance === "number") setBalance(data.balance);
      if (data && "trial" in data) setTrial(data.trial || null);
      if (typeof data?.purchased === "boolean") setPurchased(data.purchased);
    } catch {
      // Leave the last known number alone. Blanking it on a dropped request
      // would read as "your credits are gone".
    }
  }, []);

  useEffect(() => {
    refresh();
    // ₹ or $ is the server's decision; the timezone only helps where it cannot
    // place the address (localhost).
    api.get("/billing/packs", { params: { country_hint: countryHint() || undefined } }).then(({ data }) => setRules(data)).catch(() => {});
  }, [refresh]);

  const openBuy = useCallback(() => setOpen(true), []);

  const value = {
    balance,
    rules,
    trial,
    purchased,
    refresh,
    setBalance,
    openBuy,
    // Whether buying can work at all. False when the server has no Razorpay
    // keys, so the UI can hide the button rather than open a dialog that
    // apologises.
    canBuy: !!rules?.configured,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <BuyCredits
          rules={rules}
          balance={balance}
          onClose={() => setOpen(false)}
          onGranted={(b) => {
            if (typeof b === "number") setBalance(b);
            // A purchase changes more than the number: the card appears, the
            // free video is no longer the only way in.
            refresh();
          }}
        />
      )}
    </Ctx.Provider>
  );
}
