/**
 * Sidebar.js: the app's navigation.
 *
 * Structured like the reference project's: grouped sections with quiet labels, a
 * solid pill on the active item, and monochrome icons throughout. Icons carry no
 * per-item colour on purpose: colour in a nav means "this one is different", and
 * when every item has its own hue the signal is gone and only noise is left.
 *
 * Below the split point it becomes an overlay drawer rather than shrinking: a
 * 240px rail on a phone leaves nothing for the content it is navigating to.
 * The drawer enters from the RIGHT, under the hamburger that opened it, and sits
 * below the app header so the logo and close control stay put, same arrangement
 * as the reference project.
 *
 * The credits card is pinned below the list, outside the scrolling region, in
 * both layouts. See CreditsCard.js for why it is never allowed to scroll away.
 * On a phone the header also carries a compact version of it, because the whole
 * nav is behind a hamburger there and a number nobody can see is not a warning.
 */
import Logo from "./Logo";
import CreditsCard from "./CreditsCard";

// Matches the mobile header height in Dashboard.js. The drawer hangs below it
// rather than covering it, so the header's own close button stays reachable.
export const MOBILE_HEADER_H = 54;

/**
 * ── WHAT THE RAIL OFFERS NOW ─────────────────────────────────────────────────
 * The product is the demo studio. The screens the app began as — Create, My
 * voice, My scripts, Edit videos, Dashboard — are parked: still routed, still
 * rendering, their data untouched, and reachable by anybody holding a link
 * (components/Dashboard/Dashboard.js PARKED_TABS says why). They are simply not
 * offered here any more, because a rail that lists eight destinations for a
 * product with one says nothing about where to go.
 *
 * Putting one back is putting one line back.
 */
const SECTIONS = [
  {
    label: "Studio",
    items: [
      // One destination, and the whole product. `match` keeps it lit while a
      // recording is open, since that is still where it lives.
      { id: "studio", label: "Demo Studio", icon: FilmIcon, match: ["studio"] },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: UserIcon },
      // Last in the rail on purpose. Support is the row you look for when
      // something is wrong, and the place people look for it is the bottom of
      // the list.
      { id: "support", label: "Support", icon: LifebuoyIcon },
    ],
  },
];

/**
 * ── THE SHOWCASE RAIL ────────────────────────────────────────────────────────
 * Same shell, fewer doors. A visitor holding a private outreach link gets
 * Analysis (where they land, and the reason the link was worth opening), then
 * the ordinary Create / My voice / My scripts they would have as a customer.
 *
 * The Account section is absent rather than disabled. Dashboard, Profile and
 * Support are all about an account that does not exist yet, and a greyed row is
 * a promise of something being withheld; an absent one is simply not part of
 * this screen. The sign-up invitation lives in one place instead, on the credits
 * card, so there is one ask rather than four dead ends.
 */
const SHOWCASE_SECTIONS = [
  {
    label: "Studio",
    items: [
      { id: "analysis", label: "Analysis", icon: SparkIcon },
      { id: "import", label: "Create", icon: TargetIcon, match: ["import", "idea"] },
      { id: "voice", label: "My voice", icon: WaveIcon },
      { id: "scripts", label: "My scripts", icon: ScriptIcon },
    ],
  },
];

export default function Sidebar({ tab, onTab, isNarrow, open, onClose, showcase = false }) {
  const sections = showcase ? SHOWCASE_SECTIONS : SECTIONS;
  const nav = (
    <nav
      style={{
        width: isNarrow ? "100%" : 240, flexShrink: 0, height: "100%",
        display: "flex", flexDirection: "column",
        background: "var(--card)",
        // On desktop the rail is the left edge of the app; in the drawer it is
        // the right edge, so the border has to swap sides or it draws a line
        // down the middle of the screen.
        borderRight: isNarrow ? "none" : "1px solid var(--line)",
        borderLeft: isNarrow ? "1px solid var(--line)" : "none",
      }}
    >
      {/* The app header already shows the wordmark on mobile, repeating it at
          the top of the drawer just pushes the nav down. */}
      {!isNarrow && (
        <div style={{ padding: "18px 20px 20px" }}>
          <Logo size={26} fontSize={17} />
        </div>
      )}

      <div className="hg-scroll" style={{ flex: 1, minHeight: 0, padding: `${isNarrow ? 16 : 0}px 12px 16px` }}>
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--ink-mute)",
                padding: "0 10px", marginBottom: 7,
              }}
            >
              {section.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map((item) => {
                const on = item.match ? item.match.includes(tab) : item.id === tab;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onTab(item.id); onClose?.(); }}
                    aria-current={on ? "page" : undefined}
                    className={on ? undefined : "hg-nav-item"}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      textAlign: "left", padding: "8px 10px", borderRadius: 9,
                      border: "none", cursor: "pointer",
                      // A soft filled row rather than a black pill: the page the
                      // creator is on should be findable at a glance without being
                      // the loudest thing on the screen.
                      background: on ? "#ECECEC" : "transparent",
                      boxShadow: on ? "inset 0 0 0 1px rgba(15,15,15,.04)" : "none",
                      color: on ? "var(--ink)" : "var(--ink-body)",
                      fontSize: 14, fontWeight: on ? 600 : 500, letterSpacing: "-0.005em",
                    }}
                  >
                    <span style={{ display: "inline-flex", color: on ? "var(--ink)" : "var(--ink-mute)" }}>
                      <Icon />
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Credits, pinned. Still no account card: that showed a face, a name and
          an email address to the one person who already knows all three, on
          every screen, permanently, and Profile exists precisely to hold that.
          A balance is the opposite kind of fact. It changes without them acting,
          and it decides whether the next thing they try will work. */}
      <CreditsCard compact={isNarrow} showcase={showcase} />
    </nav>
  );

  if (!isNarrow) return nav;
  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="hg-fade"
        style={{
          position: "fixed", top: MOBILE_HEADER_H, left: 0, right: 0, bottom: 0,
          background: "rgba(15,15,15,.32)", zIndex: 50,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="hg-drawer-in"
        style={{
          position: "fixed", top: MOBILE_HEADER_H, right: 0, bottom: 0, zIndex: 51,
          width: "min(84vw, 320px)",
          boxShadow: "-20px 0 50px -30px rgba(15,15,15,.45)",
        }}
      >
        {nav}
      </aside>
    </>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────
   Inline rather than an icon package: a handful of glyphs is not worth a
   dependency,
   and currentColor makes them follow the active state for free. */

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };

function TargetIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <path d="M4 11v2M8 7.5v9M12 4.5v15M16 8.5v7M20 11v2" />
    </svg>
  );
}

// Analysis. A measuring mark rather than a magic sparkle: what this screen
// shows is counted, and an AI-shimmer icon would promise the opposite.
function SparkIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </svg>
  );
}

function ScriptIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5" />
      <path d="M9 12.5h7M9 16h4.5" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
    </svg>
  );
}

function LifebuoyIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M5.6 5.6l3.85 3.85M14.55 14.55l3.85 3.85M18.4 5.6l-3.85 3.85M9.45 14.55L5.6 18.4" />
    </svg>
  );
}


function UserIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </svg>
  );
}
