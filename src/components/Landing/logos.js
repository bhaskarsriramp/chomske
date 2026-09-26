/**
 * logos.js: the browsers Clipo records in, as their own official marks.
 *
 * The files are in public/browsers/, taken unmodified from alrra/browser-logos
 * (the collection most "works in" rows use). They are each browser maker's
 * trademark, shown the way any compatibility row shows them: to say where the
 * product runs, not as ours. Each is a small SVG served from our own origin and
 * cached for a month by nginx, so the row costs a few kilobytes.
 *
 * Which browsers, and why these: recording needs getDisplayMedia and
 * MediaRecorder (Studio/capture.js, captureSupport). Every current desktop
 * Chromium browser has both, and so do Firefox and Safari; phones have neither,
 * which is why the copy beside this row says "desktop".
 */

const BASE = `${process.env.PUBLIC_URL || ""}/browsers`;

export const BROWSERS = [
  ["Chrome", "chrome"],
  ["Edge", "edge"],
  ["Firefox", "firefox"],
  ["Safari", "safari"],
  ["Brave", "brave"],
  ["Opera", "opera"],
];

/** The logos alone, or with a short label before them when `label` is given. */
export function BrowserRow({ label = "" }) {
  return (
    <div className="br" aria-label={label ? undefined : "Works in Chrome, Edge, Firefox, Safari, Brave and Opera"}>
      {label && <span className="br-label">{label}</span>}
      <ul className="br-list">
        {BROWSERS.map(([name, file]) => (
          <li key={name} title={name}>
            <img src={`${BASE}/${file}.svg`} alt={name} width="26" height="26" decoding="async" />
            <span aria-hidden="true">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
