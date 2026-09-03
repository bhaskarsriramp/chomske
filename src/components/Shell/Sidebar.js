/**
 * Sidebar.js — the app's navigation.
 *
 * Structured like the reference project's: grouped sections with quiet labels, a
 * solid pill on the active item, and monochrome icons throughout. Icons carry no
 * per-item colour on purpose — colour in a nav means "this one is different", and
 * when every item has its own hue the signal is gone and only noise is left.
 *
 * Below the split point it becomes an overlay drawer rather than shrinking: a
 * 240px rail on a phone leaves nothing for the content it is navigating to.
 * The drawer enters from the RIGHT, under the hamburger that opened it, and sits
 * below the app header so the logo and close control stay put — same arrangement
 * as the reference project.
 */

// Matches the mobile header height in Dashboard.js. The drawer hangs below it
// rather than covering it, so the header's own close button stays reachable.
export const MOBILE_HEADER_H = 54;

const SECTIONS = [
  {
    label: "Studio",
    items: [
      { id: "topics", label: "Topics", icon: TargetIcon },
      { id: "transcribe", label: "My voice", icon: WaveIcon },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "dashboard", label: "Dashboard", icon: ChartIcon },
      { id: "profile", label: "Profile", icon: UserIcon },
    ],
  },
];

export default function Sidebar({ tab, onTab, isNarrow, open, onClose, user }) {
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
      {/* The app header already shows the wordmark on mobile — repeating it at
          the top of the drawer just pushes the nav down. */}
      {!isNarrow && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 18px 18px" }}>
          <span
            aria-hidden="true"
            style={{
              width: 28, height: 28, borderRadius: 8, background: "var(--ink)", color: "#fff",
              display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700,
              fontFamily: '"Noto Sans Devanagari", Inter, sans-serif',
            }}
          >
            ह
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Hinglish
          </span>
        </div>
      )}

      <div className="hg-scroll" style={{ flex: 1, minHeight: 0, padding: `${isNarrow ? 16 : 0}px 12px 16px` }}>
        {SECTIONS.map((section) => (
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
                const on = item.id === tab;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onTab(item.id); onClose?.(); }}
                    aria-current={on ? "page" : undefined}
                    className={on ? undefined : "hg-nav-item"}
                    style={{
                      display: "flex", alignItems: "center", gap: 11, width: "100%",
                      textAlign: "left", padding: "10px 11px", borderRadius: 10,
                      border: "none", cursor: "pointer",
                      background: on ? "var(--ink)" : "transparent",
                      color: on ? "#fff" : "var(--ink-body)",
                      fontSize: 14.5, fontWeight: on ? 600 : 500,
                    }}
                  >
                    <Icon />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {user && (
        <div
          style={{
            padding: "13px 16px", borderTop: "1px solid var(--line)",
            display: "flex", alignItems: "center", gap: 10, minWidth: 0,
          }}
        >
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--line)", flexShrink: 0 }}
            />
          )}
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {user.name || "Signed in"}
            </span>
            <span
              style={{
                display: "block", fontSize: 11.5, color: "var(--ink-mute)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {user.email}
            </span>
          </span>
        </div>
      )}
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
          background: "rgba(18,16,13,.32)", zIndex: 50,
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
          boxShadow: "-20px 0 50px -30px rgba(18,16,13,.45)",
        }}
      >
        {nav}
      </aside>
    </>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────
   Inline rather than an icon package: four glyphs is not worth a dependency,
   and currentColor makes them follow the active state for free. */

const svg = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };

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

function ChartIcon() {
  return (
    <svg {...svg} aria-hidden="true">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M13 16V8M18 16v-6" />
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
