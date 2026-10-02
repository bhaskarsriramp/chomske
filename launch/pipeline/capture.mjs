/**
 * capture.mjs: what the site LOOKS like. Real screenshots of the real page,
 * taken by a real browser at twice the pixel density, plus the measured box of
 * every element worth pointing at, plus the brand: logo, colours, font, mode.
 *
 * ── WHY SCREENSHOTS AND NOT REBUILT HTML ─────────────────────────────────────
 * A redrawn copy of someone's site is always slightly wrong, and a founder
 * notices their own product looking wrong before anything else. A screenshot
 * at 2× density is the product, sharp enough to zoom into, and the boxes come
 * from the page itself, so a zoom or a click lands exactly on the button: the
 * director chooses elements by id, it never guesses coordinates.
 *
 * ── WHICH BROWSER ────────────────────────────────────────────────────────────
 * A TinyFish browser session (remote Chrome over CDP) when a key is set, so
 * bot walls and cookie walls are their problem; the local Chrome otherwise
 * (--local), which is all a public site needs.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { chromium } from "playwright-core";
import { tinyfishKey, ROOT } from "./env.mjs";

const VIEW = { width: 1440, height: 900 };
const MAX_SHOTS = 6;
const MAX_ELEMENTS = 44;
/** Remotion's own headless shell (it downloads one per platform), which is all a server has. */
function remotionShell() {
  const base = path.join(ROOT, "node_modules", ".remotion", "chrome-headless-shell");
  try {
    for (const plat of fs.readdirSync(base)) {
      for (const sub of fs.readdirSync(path.join(base, plat))) {
        for (const exe of ["chrome-headless-shell", "chrome-headless-shell.exe"]) {
          const p = path.join(base, plat, sub, exe);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch {
    /* not downloaded yet */
  }
  return null;
}

const LOCAL_CHROME = () => [
  process.env.CHROME_PATH,
  path.join(ROOT, ".browser", "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
  remotionShell(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser({ local }) {
  if (!local && tinyfishKey()) {
    const res = await fetch("https://agent.tinyfish.ai/v1/browser", {
      method: "POST",
      headers: { "X-API-Key": tinyfishKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ timeout_seconds: 180 }),
      signal: AbortSignal.timeout(60_000),
    });
    const s = await res.json().catch(() => ({}));
    if (!res.ok || !s.cdp_url) throw new Error(`browser session ${res.status}: ${JSON.stringify(s).slice(0, 300)}`);
    const browser = await chromium.connectOverCDP(s.cdp_url, { timeout: 60_000 });
    return { browser, where: `tinyfish ${s.session_id}` };
  }
  const exe = LOCAL_CHROME().find((p) => p && fs.existsSync(p));
  if (!exe) throw new Error("No local Chrome found; set CHROME_PATH");
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  return { browser, where: `local ${path.basename(exe)}` };
}

/** A context at 1440×900, 2× density. A remote browser that refuses new contexts gets the same through CDP. */
async function openPage(browser) {
  try {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: "en-US" });
    return await ctx.newPage();
  } catch {
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] || (await ctx.newPage());
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 2, mobile: false });
    return page;
  }
}

/**
 * Cookie and consent banners: accept the ones that ask, so they are not in
 * every shot. One evaluate per frame: over a remote browser every call is a
 * round trip, and asking element by element took minutes.
 */
async function dismissBanners(page) {
  for (const frame of page.frames()) {
    const clicked = await frame
      .evaluate(() => {
        const words = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree|got it|ok(ay)?|continue|close)$/i;
        let n = 0;
        for (const b of document.querySelectorAll("button, [role=button], a")) {
          const text = (b.innerText || "").trim();
          if (!text || text.length > 30 || !words.test(text)) continue;
          const r = b.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          let banner = false;
          for (let e = b; e && e !== document.body; e = e.parentElement) {
            const p = getComputedStyle(e).position;
            if (p === "fixed" || p === "sticky" || /cookie|consent|gdpr|banner/i.test(`${e.id} ${e.className}`)) {
              banner = true;
              break;
            }
          }
          if (banner) {
            b.click();
            n++;
          }
        }
        return n;
      })
      .catch(() => 0);
    if (clicked) await sleep(600);
  }
}

/** No scrollbars in a product shot. */
const HIDE_SCROLLBARS = `html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}`;

/** Scroll the whole page once so lazy images load and scroll-in animations finish before any shot. */
async function warm(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(height, 20000); y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await sleep(160);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(900);
}

const BRAND = () => {
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || null;
  const rgbOf = (s) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s || "");
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const sat = (c) => {
    const mx = Math.max(c.r, c.g, c.b) / 255;
    const mn = Math.min(c.r, c.g, c.b) / 255;
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

  // Colours that buttons and links are actually painted with, weighted by area.
  const tally = new Map();
  const add = (c, w) => {
    if (!c || c.a < 0.5 || sat(c) < 0.28 || lum(c) < 0.06 || lum(c) > 0.94) return;
    if (c.r === 0 && c.g === 0 && c.b === 238) return;
    const k = hex(c);
    tally.set(k, (tally.get(k) || 0) + w);
  };
  for (const el of document.querySelectorAll("a, button, [role=button], [class*=btn], [class*=button], [class*=Button]")) {
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 16) continue;
    const cs = getComputedStyle(el);
    add(rgbOf(cs.backgroundColor), r.width * r.height);
    add(rgbOf(cs.color), r.width * 6);
    add(rgbOf(cs.borderTopColor), r.width * 2);
  }
  for (const el of document.querySelectorAll("h1 *, h2 *, [class*=accent], [class*=highlight], [class*=brand]")) {
    const r = el.getBoundingClientRect();
    if (r.width < 10) continue;
    add(rgbOf(getComputedStyle(el).color), r.width * r.height * 0.5);
  }
  const colors = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

  // The page's own background, for light or dark.
  let bg = null;
  for (const el of [document.querySelector("main"), document.body, document.documentElement]) {
    const c = el && rgbOf(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0.5) {
      bg = c;
      break;
    }
  }

  // Logo candidates in the header: named logo, or the thing that links home.
  const top = [...document.querySelectorAll("header, nav, [class*=header], [class*=Header], [class*=nav], [class*=Nav]")];
  const pool = new Set();
  for (const h of top.length ? top : [document.body]) for (const el of h.querySelectorAll("img, svg")) pool.add(el);
  const logos = [];
  // Every img and svg near the top, not only those inside something called a
  // header: hidden menus and hero mockups are full of avatars, so what counts
  // is being visible, on top, in the header band, and ideally the home link.
  for (const el of document.querySelectorAll("img, svg")) pool.add(el);
  const onTop = (el, r) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.3) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el) || (hit.closest && hit.closest("a") === el.closest("a")));
  };
  for (const el of pool) {
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12 || r.top < 0 || r.top > 140 || r.height > 120) continue;
    if (el.closest("svg") && el.closest("svg") !== el) continue;
    if (!onTop(el, r)) continue;
    const a = el.closest("a");
    const name = `${el.getAttribute("src") || ""} ${el.getAttribute("alt") || ""} ${el.getAttribute("class") || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""} ${a ? a.getAttribute("aria-label") || "" : ""}`.toLowerCase();
    let score = 0;
    if (/logo|brand|wordmark/.test(name)) score += 5;
    if (a && /^(\/|#|\.\/)?$/.test(a.getAttribute("href") || "") ) score += 4;
    if (a && abs(a.getAttribute("href")) === location.origin + "/") score += 4;
    if (r.left < 400) score += 2;
    if (r.left > window.innerWidth * 0.5) score -= 3;
    if (el.tagName === "IMG" && /avatar|user|profile|photo|person|team/.test(name)) score -= 8;
    if (el.tagName === "svg" && r.width < 22 && r.height < 22) score -= 3;
    const item = { score, w: r.width, h: r.height, kind: el.tagName.toLowerCase() };
    if (el.tagName === "IMG") item.src = abs(el.currentSrc || el.getAttribute("src"));
    else {
      const clone = el.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const color = getComputedStyle(el).color;
      item.svg = clone.outerHTML.replace(/currentColor/g, color);
      if (!clone.getAttribute("viewBox")) item.svg = item.svg.replace("<svg", `<svg viewBox="0 0 ${r.width} ${r.height}"`);
    }
    logos.push(item);
  }
  logos.sort((a, b) => b.score - a.score);
  let wordmark = null;
  for (const a of document.querySelectorAll("a")) {
    const href = a.getAttribute("href") || "";
    if (!(/^(\/|\.\/)?$/.test(href) || abs(href) === location.origin + "/")) continue;
    const r = a.getBoundingClientRect();
    if (r.top < 0 || r.top > 140 || r.left > window.innerWidth * 0.5 || r.width < 30 || r.height < 14 || r.height > 90) continue;
    if (!onTop(a, r)) continue;
    wordmark = { x: r.left, y: r.top, w: r.width, h: r.height, text: (a.innerText || "").trim().slice(0, 40) };
    break;
  }

  // The main button's own fill, neutral or not: a monochrome brand's colour is black.
  const fills = new Map();
  for (const el of document.querySelectorAll("a, button")) {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > 900 || r.width < 60 || r.height < 28 || r.height > 80) continue;
    const c = rgbOf(getComputedStyle(el).backgroundColor);
    if (!c || c.a < 0.8 || lum(c) > 0.92) continue;
    fills.set(hex(c), (fills.get(hex(c)) || 0) + r.width * r.height);
  }
  const buttonColor = [...fills.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
    .map((l) => ({ href: abs(l.getAttribute("href")), sizes: l.getAttribute("sizes") || "", rel: l.getAttribute("rel") }))
    .filter((i) => i.href);

  const h1 = document.querySelector("h1");
  return {
    title: document.title,
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]'),
    themeColor: meta('meta[name="theme-color"]'),
    ogImage: abs(meta('meta[property="og:image"]') || ""),
    colors,
    buttonColor,
    wordmark,
    background: bg ? hex(bg) : null,
    dark: bg ? lum(bg) < 0.4 : false,
    headingFont: getComputedStyle(h1 || document.body).fontFamily,
    bodyFont: getComputedStyle(document.body).fontFamily,
    logos: logos.slice(0, 4),
    icons,
    height: document.documentElement.scrollHeight,
  };
};

/** Where to stop for a shot: the top, then each new section, at least most of a screen apart. */
const STOPS = (viewH) => {
  const ys = [0];
  const marks = [...document.querySelectorAll("section, h2, [id]")]
    .map((el) => el.getBoundingClientRect().top + window.scrollY - 70)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);
  for (const y of marks) if (y - ys[ys.length - 1] >= viewH * 0.85) ys.push(Math.round(y));
  const max = document.documentElement.scrollHeight - viewH;
  // A section's visual is usually under its heading and cut by the fold:
  // move down just enough to show the biggest one whole, if it fits.
  const panels = [...document.querySelectorAll("div, section, article, figure, aside")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 260 || r.height < 160 || r.width > window.innerWidth * 0.92 || r.height > viewH * 0.8) return null;
      const cs = getComputedStyle(el);
      const surface = cs.boxShadow !== "none" || (parseFloat(cs.borderTopLeftRadius) >= 8 && (parseFloat(cs.borderTopWidth) >= 1 || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)));
      return surface ? { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, area: r.width * r.height } : null;
    })
    .filter(Boolean);
  return ys.map((y, i) => {
    if (i === 0) return 0;
    const cut = panels.filter((p) => p.top > y + 60 && p.top < y + viewH && p.bottom > y + viewH).sort((a, b) => b.area - a.area)[0];
    if (cut) {
      const want = cut.bottom + 36 - viewH;
      if (want <= cut.top - 24) y = want;
    }
    return Math.round(Math.max(0, Math.min(max, y)));
  });
};

/** Every element in view worth pointing at, as fractions of the viewport. */
const ELEMENTS = ({ vw, vh, limit, skipPinned }) => {
  const out = [];
  const seen = new Set();
  const pinned = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };
  const sel = "h1,h2,h3,h4,p,button,a,input,textarea,select,img,video,canvas,svg,figure,table,li,[role=button],[class*=card],[class*=Card]";
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("svg") && el.tagName !== "svg") continue;
    // The sticky header is in every shot; it is offered once, in the first.
    if (skipPinned && pinned(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 14) continue;
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const x2 = Math.min(vw, r.right);
    const y2 = Math.min(vh, r.bottom);
    if (x2 <= x || y2 <= y) continue;
    const tag = el.tagName.toLowerCase();
    const big = ["img", "video", "canvas", "svg", "figure", "table"].includes(tag);
    if ((x2 - x) * (y2 - y) < (big ? 0.4 : 0.6) * r.width * r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.15) continue;
    const bgPainted = (() => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(cs.backgroundColor);
      return m && (m[4] === undefined || Number(m[4]) > 0.3);
    })();
    const buttonish = tag === "button" || el.getAttribute("role") === "button" || (tag === "a" && (bgPainted || /btn|button|cta/i.test(el.className)));
    const kind = /^h[1-4]$/.test(tag)
      ? "heading"
      : buttonish
        ? "button"
        : tag === "a"
          ? "link"
          : ["input", "textarea", "select"].includes(tag)
            ? "input"
            : ["img", "video", "canvas", "svg", "figure"].includes(tag)
              ? "visual"
              : tag === "table"
                ? "table"
                : /card/i.test(el.className)
                  ? "card"
                  : tag === "li"
                    ? "item"
                    : "text";
    const text = (el.innerText || el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const area = (x2 - x) * (y2 - y);
    if (kind === "text" && text.length < 16) continue;
    if (kind === "link" && text.length < 2) continue;
    if (kind === "visual" && area < 160 * 100) continue;
    if (kind === "item" && text.length < 6) continue;
    const key = `${Math.round(x / 8)},${Math.round(y / 8)},${Math.round(x2 / 8)},${Math.round(y2 / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const weight = { heading: 6, button: 6, input: 5, card: 4, visual: 4, table: 4, item: 2, text: 2, link: 1 }[kind] || 1;
    out.push({ kind, text, x: x / vw, y: y / vh, w: (x2 - x) / vw, h: (y2 - y) / vh, score: weight * 1e6 + Math.min(area, 4e5) });
  }
  for (const el of document.querySelectorAll("div, section, article, aside")) {
    const r = el.getBoundingClientRect();
    if (r.width < 220 || r.height < 140 || r.width > vw * 0.92) continue;
    const x = Math.max(0, r.left);
    const y = Math.max(0, r.top);
    const x2 = Math.min(vw, r.right);
    const y2 = Math.min(vh, r.bottom);
    if (x2 <= x || y2 <= y) continue;
    if ((x2 - x) * (y2 - y) < 0.4 * r.width * r.height) continue;
    if (skipPinned && pinned(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.15) continue;
    const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.backgroundImage !== "none";
    const surface = cs.boxShadow !== "none" || (parseFloat(cs.borderTopLeftRadius) >= 8 && (filled || parseFloat(cs.borderTopWidth) >= 1));
    if (!surface) continue;
    const key = `${Math.round(x / 8)},${Math.round(y / 8)},${Math.round(x2 / 8)},${Math.round(y2 / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const head = el.querySelector("h1,h2,h3,h4,[class*=title]");
    const text = ((head && head.innerText) || el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const area = (x2 - x) * (y2 - y);
    out.push({ kind: "panel", text, x: x / vw, y: y / vh, w: (x2 - x) / vw, h: (y2 - y) / vh, score: 5 * 1e6 + Math.min(area, 4e5) });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ score, ...e }) => e);
};

/** The logo's tone, measured on its own pixels: is it ink on nothing, or a solid tile? */
const TONE = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = Math.max(1, Math.min(256, img.naturalWidth || 256));
  const h = Math.max(1, Math.round(w * ((img.naturalHeight || 256) / (img.naturalWidth || 256))));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let sum = 0;
  let n = 0;
  // The logo's own colour: the average of its saturated pixels.
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let cn = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    n++;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx > 40 && (mx - mn) / mx > 0.35) {
      cr += d[i];
      cg += d[i + 1];
      cb += d[i + 2];
      cn++;
    }
  }
  const corner = (x, y) => d[(y * w + x) * 4 + 3] > 200;
  // A tile: square corners filled, or a rounded tile that fills most of its box.
  const solid = (corner(1, 1) && corner(w - 2, 1) && corner(1, h - 2) && corner(w - 2, h - 2)) || n / (w * h) > 0.62;
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  const color = cn > n * 0.08 ? `#${hex(cr / cn)}${hex(cg / cn)}${hex(cb / cn)}` : null;
  // Distinct colours (4 bits a channel): a logo uses a handful, a photo hundreds.
  const buckets = new Set();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) buckets.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
  return { w: img.naturalWidth, h: img.naturalHeight, lum: n ? sum / n : 0.5, opaque: n / (w * h), solid, color, colors: buckets.size };
};

/** A photographed wordmark with its header behind it: the corner colour keyed out, soft at the edges. */
const KEY = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const [br, bg, bb] = [d[0], d[1], d[2]];
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb);
    d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, (dist - 18) / 60)));
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL("image/png");
};

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
}

const extOf = (url, type) => {
  if (/svg/.test(type) || /\.svg(\?|$)/i.test(url)) return "svg";
  if (/png/.test(type) || /\.png(\?|$)/i.test(url)) return "png";
  if (/webp/.test(type) || /\.webp(\?|$)/i.test(url)) return "webp";
  if (/jpe?g/.test(type) || /\.jpe?g(\?|$)/i.test(url)) return "jpg";
  if (/icon/.test(type) || /\.ico(\?|$)/i.test(url)) return "ico";
  return "png";
};
const MIME = { svg: "image/svg+xml", png: "image/png", webp: "image/webp", jpg: "image/jpeg", ico: "image/x-icon" };

/** The logo: the header's own mark first, then the touch icon, then nothing (a monogram is drawn). */
async function saveLogo(page, info, dir) {
  const tries = [];
  // Only a candidate that is the home link or is named as a logo; then a
  // text wordmark (the home link, photographed); then the touch icon.
  for (const l of info.logos) if (l.score >= 4) tries.push(l);
  if (info.wordmark) tries.push({ wordmark: info.wordmark });
  const touch = info.icons.find((i) => /apple-touch/.test(i.rel)) || info.icons.find((i) => /svg/.test(i.href)) || info.icons.sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes) || 0)[0];
  if (touch) tries.push({ src: touch.href, icon: true });
  for (const t of tries) {
    try {
      let bytes;
      let ext;
      if (t.wordmark) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);
        const m = t.wordmark;
        const shot = await page.screenshot({ type: "png", omitBackground: true, clip: { x: Math.max(0, m.x - 4), y: Math.max(0, m.y - 4), width: m.w + 8, height: m.h + 8 } });
        const keyed = await page.evaluate(KEY, `data:image/png;base64,${shot.toString("base64")}`);
        bytes = Buffer.from(keyed.split(",")[1], "base64");
        ext = "png";
      } else if (t.svg) {
        bytes = Buffer.from(t.svg);
        ext = "svg";
      } else if (t.src) {
        const d = await download(t.src);
        bytes = d.bytes;
        ext = extOf(t.src, d.type);
        if (ext === "ico") continue;
      } else continue;
      const tone = await page.evaluate(TONE, `data:${MIME[ext]};base64,${bytes.toString("base64")}`);
      if (!tone.w || tone.opaque < 0.02) continue;
      if (ext !== "svg" && !t.wordmark && tone.colors > 260) continue; // a photograph, not a mark
      const file = `logo.${ext}`;
      await fsp.writeFile(path.join(dir, file), bytes);
      return { file, ...tone, aspect: tone.w / Math.max(1, tone.h), icon: !!t.icon, wordmark: !!t.wordmark };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

export async function captureSite(url, dir, { local = false, log = () => {}, onProgress = () => {} } = {}) {
  await fsp.mkdir(path.join(dir, "shots"), { recursive: true });
  let session;
  try {
    session = await openBrowser({ local });
  } catch (err) {
    // Off unless asked for (LAUNCH_LOCAL_FALLBACK=1, e.g. in launch/.env): in
    // the app a browser on our own server must not open an address a stranger
    // typed, since a redirect could point it at the server's own network.
    if (local || process.env.LAUNCH_LOCAL_FALLBACK !== "1") throw err;
    log(`remote browser unavailable (${err.message.slice(0, 120)}), using local Chrome`);
    session = await openBrowser({ local: true });
  }
  const { browser, where } = session;
  log(`browser: ${where}`);
  try {
    const page = await openPage(browser);
    await page.addInitScript((css) => {
      const add = () => {
        const s = document.createElement("style");
        s.textContent = css;
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) add();
      else document.addEventListener("DOMContentLoaded", add);
    }, HIDE_SCROLLBARS);
    const t0 = Date.now();
    const lap = (what) => log(`  ${what} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    lap("loaded");
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await sleep(1200);
    await dismissBanners(page);
    lap("settled");
    await warm(page);
    lap("warmed");
    const info = await page.evaluate(BRAND);
    const stops = (await page.evaluate(STOPS, VIEW.height)).slice(0, MAX_SHOTS);
    const shots = [];
    for (let i = 0; i < stops.length; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), stops[i]);
      await sleep(1000);
      const id = `s${i + 1}`;
      await page.screenshot({ path: path.join(dir, "shots", `${id}.png`), type: "png", scale: "device" });
      await page.screenshot({ path: path.join(dir, "shots", `${id}.jpg`), type: "jpeg", quality: 72, scale: "css" });
      const elements = (await page.evaluate(ELEMENTS, { vw: VIEW.width, vh: VIEW.height, limit: MAX_ELEMENTS, skipPinned: i > 0 })).map((e, j) => ({ id: `${id}e${j + 1}`, ...e }));
      shots.push({ id, file: `shots/${id}.png`, preview: `shots/${id}.jpg`, scrollY: stops[i], elements });
      lap(`shot ${id}`);
      onProgress((i + 1) / stops.length);
    }
    const logo = await saveLogo(page, info, dir);
    log(`captured ${shots.length} shots, ${shots.reduce((n, s) => n + s.elements.length, 0)} elements, logo: ${logo ? logo.file : "none"}`);
    const { logos, ...brand } = info;
    return { url: page.url(), view: VIEW, brand: { ...brand, logo }, shots };
  } finally {
    await browser.close().catch(() => {});
  }
}
