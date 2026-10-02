/**
 * capture.mjs: what the site LOOKS like. Real screenshots of the real page,
 * taken by a real browser at twice the pixel density, plus the measured box of
 * every element worth pointing at, plus the brand: logo candidates, colours,
 * font, mode.
 *
 * ── WHY SCREENSHOTS AND NOT REBUILT HTML ─────────────────────────────────────
 * A redrawn copy of someone's site is always slightly wrong, and a founder
 * notices their own product looking wrong before anything else. A screenshot
 * at 2× density is the product, sharp enough to zoom into, and the boxes come
 * from the page itself, so a zoom or a click lands exactly on the button: the
 * director chooses elements by id, it never guesses coordinates.
 *
 * ── WHERE THE SHOTS ARE TAKEN ────────────────────────────────────────────────
 * Not every screenful: the hero, then the sections a launch video is made of,
 * found by their headings (pricing, features, how it works, the product in
 * action, what customers say), then others to fill. A section the homepage
 * only links to (a separate /pricing page) is visited. Each stop is scrolled
 * to in steps, like a person scrolls, so scroll-in animations play, and a
 * shot whose content has not appeared (cards still faded out) is waited for,
 * then retaken, then dropped rather than shown blank.
 *
 * ── THE LOGO IS CHOSEN BY LOOKING ────────────────────────────────────────────
 * Every mark the site offers is collected (touch icon, app icons, the web app
 * manifest, the logo in structured data, the header's own image, the home
 * link photographed) and normalised to a trimmed PNG. The director sees them
 * all beside the screenshots and picks the brand's own; a creator who says
 * "wrong logo" gets the next best, or the one they link to.
 *
 * ── WHICH BROWSER ────────────────────────────────────────────────────────────
 * A TinyFish browser session (remote Chrome over CDP) when a key is set, so
 * bot walls and cookie walls are their problem; a local Chrome only when
 * asked for (--local, or LAUNCH_LOCAL_FALLBACK=1 in a terminal).
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { chromium } from "playwright-core";
import { tinyfishKey, tinyfishCount } from "./env.mjs";
import { headlessShell } from "./browser.mjs";

const VIEW = { width: 1440, height: 900 };
const MAX_SHOTS = 7;
const MAX_ELEMENTS = 44;
const MAX_LOGOS = 6;
/** A shot is kept when at least this share of its sample points show something. */
const FILLED_ENOUGH = 0.2;
const FILLED_AT_ALL = 0.1;
const LOCAL_CHROME = () => [
  process.env.CHROME_PATH,
  headlessShell(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser({ local }) {
  const key = local ? "" : tinyfishKey();
  if (key) {
    const res = await fetch("https://agent.tinyfish.ai/v1/browser", {
      method: "POST",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
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

async function openSession({ local, log }) {
  // A refused session (rate limit, credits) is asked for again on the next key in the pool.
  const tries = local ? 1 : Math.max(1, Math.min(3, tinyfishCount()));
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      return await openBrowser({ local });
    } catch (e) {
      err = e;
      if (i < tries - 1) log(`browser session refused (${String(e.message).slice(0, 80)}), trying the next key`);
    }
  }
  // Off unless asked for (LAUNCH_LOCAL_FALLBACK=1, e.g. in launch/.env): in
  // the app a browser on our own server must not open an address a stranger
  // typed, since a redirect could point it at the server's own network.
  if (local || process.env.LAUNCH_LOCAL_FALLBACK !== "1") throw err;
  log(`remote browser unavailable (${err.message.slice(0, 120)}), using local Chrome`);
  return openBrowser({ local: true });
}

/** A context at 1440×900, 2× density. A remote browser that refuses new contexts gets the same through CDP. */
async function openPage(browser) {
  let page;
  try {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: "en-US" });
    page = await ctx.newPage();
  } catch {
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] || (await ctx.newPage());
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 2, mobile: false });
  }
  // Requests in flight, so a shot waits for data a section fetches as it
  // scrolls into view (pricing loaded from an API). Analytics, chat and
  // streaming connections never "finish" and are not counted.
  const net = { inflight: new Set(), last: Date.now() };
  const IGNORE = /google-analytics|googletagmanager|doubleclick|facebook\.(net|com)\/tr|hotjar|segment\.(io|com)|mixpanel|intercom|crisp|sentry|clarity\.ms|plausible|posthog|amplitude|vercel-insights|\/collect\b|beacon|\/rum\b/i;
  page.on("request", (r) => {
    if (IGNORE.test(r.url()) || ["websocket", "eventsource", "manifest"].includes(r.resourceType())) return;
    net.inflight.add(r);
    net.last = Date.now();
  });
  const settle = (r) => {
    if (net.inflight.delete(r)) net.last = Date.now();
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  page.launchNet = net;
  // Sites that respect "reduce motion" show their content at once instead of
  // fading it in: fewer half-faded shots (ScreenshotOne's reduce_motion idea).
  await page.emulateMedia({ reducedMotion: "reduce" }).catch(() => {});
  await page.addInitScript((css) => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    if (document.documentElement) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, HIDE_SCROLLBARS);
  return page;
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

/**
 * Nothing in a product shot that is not the product: no scrollbars, and no
 * chat bubbles or help launchers (the usual vendors, by their own markup).
 */
const CHAT_WIDGETS = [
  "#intercom-container", ".intercom-lightweight-app", "iframe[name^=intercom]", "#crisp-chatbox", ".crisp-client",
  "#hubspot-messages-iframe-container", "#drift-widget", "#drift-frame-controller", "iframe[title*='chat' i]",
  "#tidio-chat", "#tawk-bubble-container", "iframe[src*='tawk.to']", "#launcher", ".zEWidget-launcher",
  "iframe#launcher", "#chat-widget-container", "#fc_frame", "[id^='gorgias-chat']", ".cky-consent-container",
].join(",");
const HIDE_SCROLLBARS = `html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}${CHAT_WIDGETS}{display:none!important}`;

/**
 * Scroll the whole page once, inside the page (one round trip, not one per
 * step), so lazy images load and scroll-in animations have played.
 */
async function warm(page) {
  await page
    .evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const h = Math.min(document.documentElement.scrollHeight, 24000);
      for (let y = 0; y < h; y += 500) {
        window.scrollTo(0, y);
        await wait(140);
      }
      window.scrollTo(0, 0);
      await wait(700);
    })
    .catch(() => {});
}

/** Open a page and let it settle: loaded, quiet, banners accepted, scrolled through once. */
async function loadPage(page, url, lap = () => {}) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  lap("loaded");
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await sleep(1000);
  await dismissBanners(page);
  await warm(page);
  lap("settled");
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

  // Navigation links (for a separate pricing or features page), the web app
  // manifest (its icons), and a logo named in structured data.
  const navLinks = [];
  const seenHref = new Set();
  for (const a of document.querySelectorAll("header a, nav a, [class*=nav] a, [class*=Nav] a, [class*=header] a")) {
    const href = abs(a.getAttribute("href") || "");
    const text = (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!href || !text || seenHref.has(href)) continue;
    seenHref.add(href);
    navLinks.push({ text, href });
  }
  const manifest = abs(document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "") || null;
  let jsonLdLogo = null;
  const walk = (o) => {
    if (!o || jsonLdLogo) return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o === "object") {
      const l = o.logo;
      if (l) jsonLdLogo = abs(typeof l === "string" ? l : l.url || l.contentUrl || "") || null;
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
    }
  };
  for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(sc.textContent));
    } catch {
      /* not JSON */
    }
  }

  const h1 = document.querySelector("h1");
  return {
    navLinks: navLinks.slice(0, 40),
    manifest,
    jsonLdLogo,
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

/* ── Where to take the shots ──────────────────────────────────────────────── */

/** The sections a launch video is made of, in the order it wants them. */
const PRIORITY = ["pricing", "features", "how", "product", "proof"];

/**
 * Every section of the page by its heading (and ids that name one), with what
 * kind of section it is. Hidden headings (closed menus) have no box and are
 * skipped; the footer is not a section.
 */
const SECTIONS = () => {
  const KEYS = [
    ["pricing", /\bpric|\bplans?\b|per month|\/mo\b|billing/i],
    ["how", /how it works|how .{0,24}works|\bin \d+ steps|three steps|get started in/i],
    ["proof", /testimonial|reviews?\b|customers? (say|love)|loved by|trusted by|wall of love|case stud|what .{0,24}say/i],
    ["product", /\bdemo\b|in action|see it|dashboard|product tour|\bwatch\b|under the hood/i],
    ["features", /feature|what you get|capabilit|everything you need|built for|why /i],
    ["faq", /\bfaq\b|frequently|questions/i],
  ];
  const out = [];
  const seen = new Set();
  const consider = (el, text) => {
    if (el.closest("footer")) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const y = Math.round(r.top + window.scrollY);
    if (y < 260) return;
    const sec = el.closest("section");
    const hay = `${text} ${el.id || ""} ${sec?.id || ""} ${String(sec?.className || "")}`;
    const key = (KEYS.find(([, re]) => re.test(hay)) || [""])[0];
    const bucket = Math.round(y / 150);
    if (seen.has(bucket)) return;
    seen.add(bucket);
    out.push({ y, text: String(text || "").replace(/\s+/g, " ").trim().slice(0, 80), key });
  };
  for (const h of document.querySelectorAll("h1, h2")) consider(h, h.innerText);
  for (const el of document.querySelectorAll("[id]")) if (/pric|plan|feature|how|demo|testimonial|review|faq/i.test(el.id)) consider(el, el.id);
  return { sections: out.sort((a, b) => a.y - b.y), height: document.documentElement.scrollHeight };
};

/** The stops: the hero, the sections a launch video wants, then others, spread out. */
function planStops(sections, height) {
  const max = Math.max(0, height - VIEW.height);
  const stops = [{ y: 0, label: "hero", key: "hero" }];
  const take = (s) => {
    const y = Math.max(0, Math.min(max, s.y - 80));
    if (stops.length < MAX_SHOTS && stops.every((t) => Math.abs(t.y - y) >= VIEW.height * 0.6)) stops.push({ y, label: s.text, key: s.key });
  };
  for (const key of PRIORITY) {
    const s = sections.find((x) => x.key === key);
    if (s) take(s);
  }
  for (const s of sections) if (s.key !== "faq") take(s);
  return stops.sort((a, b) => a.y - b.y);
}

/**
 * A section's visual is usually under its heading and cut by the fold: move
 * down just enough to show the biggest cut-off panel whole, if it fits.
 *
 * Never further than `limit` (just above the section's own heading): on
 * getle.ad the founder card below the pricing was cut by the fold, and fitting
 * it scrolled the pricing card itself out of the shot.
 */
const FIT = ({ y, viewH, limit = Infinity }) => {
  const max = document.documentElement.scrollHeight - viewH;
  const panels = [...document.querySelectorAll("div, section, article, figure, aside")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 260 || r.height < 160 || r.width > window.innerWidth * 0.92 || r.height > viewH * 0.8) return null;
      const cs = getComputedStyle(el);
      const surface = cs.boxShadow !== "none" || (parseFloat(cs.borderTopLeftRadius) >= 8 && (parseFloat(cs.borderTopWidth) >= 1 || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)));
      return surface ? { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, area: r.width * r.height } : null;
    })
    .filter(Boolean);
  // The biggest cut-off panel that can be shown whole without passing the limit.
  const cut = panels
    .filter((p) => p.top > y + 60 && p.top < y + viewH && p.bottom > y + viewH)
    .sort((a, b) => b.area - a.area)
    .find((p) => {
      const want = p.bottom + 36 - viewH;
      return want <= p.top - 24 && want <= limit;
    });
  if (cut) y = cut.bottom + 36 - viewH;
  return Math.round(Math.max(0, Math.min(max, y)));
};

/**
 * How much of the screen shows something: a grid of points, each counted when
 * what is on top there is visible content (own text, an image, a control, a
 * painted card) and not faded out by itself or anything around it. A section
 * whose cards are still at opacity 0 scores low here and is waited for.
 */
const FILLED = () => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const opacity = (el) => {
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= Number(cs.opacity);
      if (o < 0.3) return o;
    }
    return o;
  };
  const painted = (el) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
    return m && (m[4] === undefined || Number(m[4]) > 0.5) && el.getBoundingClientRect().width < W * 0.95;
  };
  let hit = 0;
  let n = 0;
  for (let gx = 1; gx <= 7; gx++) {
    for (let gy = 1; gy <= 5; gy++) {
      n++;
      const el = document.elementFromPoint((gx / 8) * W, 90 + (gy / 6) * (H - 90));
      if (!el) continue;
      const tag = el.tagName.toUpperCase();
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      const content = own || ["IMG", "SVG", "CANVAS", "VIDEO", "INPUT", "BUTTON", "PICTURE", "TEXTAREA", "SELECT"].includes(tag) || getComputedStyle(el).backgroundImage !== "none" || painted(el);
      if (content && opacity(el) > 0.5) hit++;
    }
  }
  return hit / n;
};

/** Scroll to y in steps, inside the page, so whatever reveals on scroll does. */
async function scrollTo(page, y) {
  await page
    .evaluate(async (to) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const from = window.scrollY;
      const steps = Math.min(14, Math.max(1, Math.ceil(Math.abs(to - from) / 300)));
      for (let i = 1; i <= steps; i++) {
        window.scrollTo(0, from + ((to - from) * i) / steps);
        await wait(70);
      }
    }, y)
    .catch(() => {});
}

/**
 * Whether what is on screen has finished arriving: images in view decoded,
 * web fonts loaded (text is invisible while they load), no skeleton or
 * spinner showing, no fade-in still running, and nothing moving between two
 * looks 350 ms apart. One call, all inside the page.
 */
const SETTLED = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const W = window.innerWidth;
  const H = window.innerHeight;
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  };
  const shown = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.2;
  };
  const fonts = !document.fonts || document.fonts.status === "loaded";
  const images = [...document.images].filter((i) => inView(i) && shown(i) && i.loading !== "lazy-skipped" && (!i.complete || i.naturalWidth === 0)).length;
  const loaders = [...document.querySelectorAll("[class*=skeleton],[class*=Skeleton],[class*=shimmer],[class*=Shimmer],[class*=spinner],[class*=Spinner],[class*=loader]:not(html):not(body),[aria-busy=true],[role=progressbar]")].filter((el) => inView(el) && shown(el)).length;
  const animations = document.getAnimations
    ? document.getAnimations().filter((a) => {
        if (a.playState !== "running" || !a.effect || !a.effect.target) return false;
        const t = a.effect.getTiming ? a.effect.getTiming() : {};
        return t.iterations !== Infinity && inView(a.effect.target);
      }).length
    : 0;
  const look = () => {
    let s = "";
    for (let gx = 1; gx <= 6; gx++) {
      for (let gy = 1; gy <= 4; gy++) {
        const el = document.elementFromPoint((gx / 7) * W, 90 + (gy / 5) * (H - 90));
        if (!el) {
          s += "_";
          continue;
        }
        const r = el.getBoundingClientRect();
        s += `${el.tagName}${Math.round(r.x / 3)},${Math.round(r.y / 3)},${Math.round(Number(getComputedStyle(el).opacity) * 10)};`;
      }
    }
    return s;
  };
  const before = look();
  await wait(350);
  return { fonts, images, loaders, animations, still: before === look() };
};

/**
 * Wait until the screen has settled and shows enough, or until maxMs. Says
 * why it waited (or why it gave up), which is logged with every shot.
 */
async function waitSettled(page, maxMs) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(SETTLED).catch(() => null);
    const fill = await page.evaluate(FILLED).catch(() => 1);
    const net = page.launchNet;
    const busy = net && net.inflight.size > 0 && Date.now() - net.last < 600;
    const reasons = [];
    if (!s) reasons.push("page not answering");
    else {
      if (!s.fonts) reasons.push("fonts loading");
      if (s.images) reasons.push(`${s.images} images loading`);
      if (s.loaders) reasons.push(`${s.loaders} loaders showing`);
      if (s.animations) reasons.push(`${s.animations} animations running`);
      if (!s.still) reasons.push("still moving");
    }
    if (busy) reasons.push(`${net.inflight.size} requests in flight`);
    if (fill < FILLED_ENOUGH) reasons.push(`only ${Math.round(fill * 100)}% shows content`);
    const waited = Date.now() - t0;
    if (!reasons.length) return { ready: true, fill, waited, reasons };
    if (waited > maxMs) return { ready: false, fill, waited, reasons };
    await sleep(500);
  }
}

/**
 * One shot at y: fitted to the panel under the fold, scrolled to in steps,
 * waited for until its content is there (twice, the second time nudging the
 * page so observers fire again), then photographed with its elements. A shot
 * that never fills is returned with `blank`, and the caller drops it.
 */
async function shoot(page, dir, { y, id, label = "", key = "", skipPinned = true, url = "" }) {
  // Stops sit 80 px above their heading; the fit may move down until the heading is near the top, no further.
  const at = y <= 0 ? 0 : await page.evaluate(FIT, { y, viewH: VIEW.height, limit: y + 56 }).catch(() => y);
  await scrollTo(page, at);
  await sleep(300);
  let check = await waitSettled(page, 6000);
  if (check.fill < FILLED_ENOUGH) {
    // Still empty: scroll away and back, so observers that missed it fire again.
    await scrollTo(page, Math.max(0, at - 240));
    await sleep(300);
    await scrollTo(page, at);
    check = await waitSettled(page, 4000);
  }
  const fill = check.fill;
  const scrollY = await page.evaluate(() => Math.round(window.scrollY)).catch(() => at);
  if (fill < FILLED_AT_ALL) return { id, blank: true, scrollY, label, fill, waited: check.waited, issues: check.reasons };
  // Not animations: "disabled": over a remote browser it waits on an animation
  // frame the background tab never paints, and the shot times out (seen on
  // getle.ad). waitSettled has already waited for finite animations to end.
  await page.screenshot({ path: path.join(dir, "shots", `${id}.png`), type: "png", scale: "device", timeout: 45_000 });
  await page.screenshot({ path: path.join(dir, "shots", `${id}.jpg`), type: "jpeg", quality: 72, scale: "css", timeout: 45_000 });
  const elements = (await page.evaluate(ELEMENTS, { vw: VIEW.width, vh: VIEW.height, limit: MAX_ELEMENTS, skipPinned })).map((e, j) => ({ id: `${id}e${j + 1}`, ...e }));
  return { id, file: `shots/${id}.png`, preview: `shots/${id}.jpg`, scrollY, label, key, url, fill: Math.round(fill * 100) / 100, ready: check.ready, waited: check.waited, issues: check.reasons, elements };
}

/** The section on this page that matches words ("pricing", a heading's text), as a scroll position. */
const FIND = (words) => {
  const want = String(words || "").toLowerCase().trim();
  if (!want) return null;
  const parts = want.split(/\s+/).filter((w) => w.length > 2);
  let best = null;
  for (const el of document.querySelectorAll("h1, h2, h3, [id], section")) {
    if (el.closest("footer")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const text = `${el.id || ""} ${el.tagName === "SECTION" ? "" : el.innerText || ""}`.toLowerCase();
    const score = text.includes(want) ? 10 : parts.filter((p) => text.includes(p)).length;
    if (score > 0 && (!best || score > best.score)) best = { score, y: Math.round(r.top + window.scrollY), text: (el.innerText || el.id || "").replace(/\s+/g, " ").trim().slice(0, 80) };
  }
  return best;
};

/* ── The logo ──────────────────────────────────────────────────────────────── */

/**
 * Any image the browser can draw, as a trimmed PNG (at most 512 px) and what
 * it is like: its size, whether it is a solid tile, its colour, how much of it
 * is white or black (a white wordmark vanishes on a light video), how many
 * colours it has (a photograph has hundreds).
 */
const NORMALIZE = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const nw = img.naturalWidth || 512;
  const nh = img.naturalHeight || 512;
  const k = Math.min(1, 512 / Math.max(nw, nh));
  const w0 = Math.max(1, Math.round(nw * k));
  const h0 = Math.max(1, Math.round(nh * k));
  const c0 = document.createElement("canvas");
  c0.width = w0;
  c0.height = h0;
  const g0 = c0.getContext("2d");
  g0.drawImage(img, 0, 0, w0, h0);
  const d0 = g0.getImageData(0, 0, w0, h0).data;
  let x1 = w0;
  let y1 = h0;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < h0; y++) {
    for (let x = 0; x < w0; x++) {
      if (d0[(y * w0 + x) * 4 + 3] > 10) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(c0, x1, y1, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let n = 0;
  let sum = 0;
  let light = 0;
  let dark = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let cn = 0;
  const buckets = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    n++;
    sum += l;
    if (l > 0.86) light++;
    if (l < 0.18) dark++;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx > 40 && (mx - mn) / mx > 0.35) {
      cr += d[i];
      cg += d[i + 1];
      cb += d[i + 2];
      cn++;
    }
    buckets.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
  }
  const corner = (x, y) => d[(y * w + x) * 4 + 3] > 200;
  const solid = (w > 4 && h > 4 && corner(1, 1) && corner(w - 2, 1) && corner(1, h - 2) && corner(w - 2, h - 2)) || n / (w * h) > 0.62;
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  return {
    png: c.toDataURL("image/png"),
    w,
    h,
    aspect: w / h,
    lum: n ? sum / n : 0.5,
    light: n ? light / n : 0,
    dark: n ? dark / n : 0,
    opaque: n / (w * h),
    solid,
    color: cn > n * 0.08 ? `#${hex(cr / cn)}${hex(cg / cn)}${hex(cb / cn)}` : null,
    colors: buckets.size,
  };
};

async function fetchManifestIcons(url) {
  try {
    const { bytes } = await download(url);
    const m = JSON.parse(bytes.toString("utf8"));
    return (m.icons || [])
      .map((i) => ({ src: new URL(i.src, url).href, size: parseInt(String(i.sizes || "0").split("x")[0], 10) || 0, purpose: i.purpose || "" }))
      .filter((i) => !/monochrome/.test(i.purpose))
      .sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
}

/** Every logo the site offers, as candidates L1, L2, … saved under logos/. Best guess first. */
async function collectLogos(page, info, dir) {
  await fsp.mkdir(path.join(dir, "logos"), { recursive: true });
  const sources = [];
  const icons = info.icons || [];
  // The navbar's own logo first: every site puts its logo there, top left,
  // linking home (the image or svg itself, then the home link photographed).
  // The app icon is the same brand's square mark, and the fallback.
  for (const l of (info.logos || []).filter((l) => l.score >= 4).slice(0, 2)) sources.push(l.svg ? { source: "navbar logo", svg: l.svg } : { source: "navbar logo", src: l.src });
  if (info.wordmark) sources.push({ source: "navbar logo (photographed)", wordmark: info.wordmark });
  const touch = icons.filter((i) => /apple-touch/.test(i.rel)).sort((a, b) => (parseInt(b.sizes, 10) || 0) - (parseInt(a.sizes, 10) || 0))[0];
  if (touch) sources.push({ source: "app icon", src: touch.href });
  for (const i of (await (info.manifest ? fetchManifestIcons(info.manifest) : [])).slice(0, 1)) sources.push({ source: "app icon (manifest)", src: i.src });
  const svgIcon = icons.find((i) => /\.svg(\?|$)/i.test(i.href));
  if (svgIcon) sources.push({ source: "site icon (svg)", src: svgIcon.href });
  const bigIcon = icons.filter((i) => !/apple-touch/.test(i.rel) && (parseInt(i.sizes, 10) || 0) >= 64).sort((a, b) => (parseInt(b.sizes, 10) || 0) - (parseInt(a.sizes, 10) || 0))[0];
  if (bigIcon) sources.push({ source: "site icon", src: bigIcon.href });
  if (info.jsonLdLogo) sources.push({ source: "logo in the page's data", src: info.jsonLdLogo });
  const fallback = icons.find((i) => /\.ico(\?|$)/i.test(i.href)) || icons[0];
  if (fallback && !sources.some((s) => s.src === fallback.href)) sources.push({ source: "favicon", src: fallback.href });

  const out = [];
  const seen = new Set();
  for (const s of sources) {
    if (out.length >= MAX_LOGOS) break;
    try {
      let dataUrl;
      if (s.wordmark) {
        await scrollTo(page, 0);
        await sleep(400);
        const m = s.wordmark;
        const shot = await page.screenshot({ type: "png", omitBackground: true, clip: { x: Math.max(0, m.x - 4), y: Math.max(0, m.y - 4), width: m.w + 8, height: m.h + 8 } });
        dataUrl = await page.evaluate(KEY, `data:image/png;base64,${shot.toString("base64")}`);
      } else if (s.svg) {
        dataUrl = `data:image/svg+xml;base64,${Buffer.from(s.svg).toString("base64")}`;
      } else {
        const d = await download(s.src);
        const ext = extOf(s.src, d.type);
        dataUrl = `data:${MIME[ext] || "image/png"};base64,${d.bytes.toString("base64")}`;
      }
      const norm = await page.evaluate(NORMALIZE, dataUrl);
      if (!norm || norm.w < 16 || norm.h < 16 || norm.opaque < 0.02) continue;
      if (!s.wordmark && !s.svg && norm.colors > 300 && norm.aspect > 0.6 && norm.aspect < 1.6 && !/icon/.test(s.source)) continue; // a photograph
      const sig = `${norm.w}x${norm.h}:${norm.colors}:${Math.round(norm.lum * 100)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      const id = `L${out.length + 1}`;
      const file = `logos/${id}.png`;
      await fsp.writeFile(path.join(dir, file), Buffer.from(norm.png.split(",")[1], "base64"));
      const { png, ...facts } = norm;
      out.push({ id, file, source: s.source, wordmark: !!s.wordmark || norm.aspect > 2.2, ...facts });
    } catch {
      /* next source */
    }
  }
  return out;
}

/** A logo the creator linked to, as one more candidate. */
async function logoFromUrl(page, dir, url, id) {
  const d = await download(url);
  const ext = extOf(url, d.type);
  const norm = await page.evaluate(NORMALIZE, `data:${MIME[ext] || "image/png"};base64,${d.bytes.toString("base64")}`);
  if (!norm) throw new Error("that image is empty");
  await fsp.mkdir(path.join(dir, "logos"), { recursive: true });
  const file = `logos/${id}.png`;
  await fsp.writeFile(path.join(dir, file), Buffer.from(norm.png.split(",")[1], "base64"));
  const { png, ...facts } = norm;
  return { id, file, source: "the creator's link", wordmark: norm.aspect > 2.2, ...facts };
}

/* ── The two calls ─────────────────────────────────────────────────────────── */

const sameSite = (a, b) => {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
};

/** The first read of a site: its shots, their elements, the brand and the logo candidates. */
export async function captureSite(url, dir, { local = false, log = () => {}, onProgress = () => {} } = {}) {
  await fsp.mkdir(path.join(dir, "shots"), { recursive: true });
  const { browser, where } = await openSession({ local, log });
  log(`browser: ${where}`);
  try {
    const page = await openPage(browser);
    const t0 = Date.now();
    const lap = (what) => log(`  ${what} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await loadPage(page, url, lap);
    const info = await page.evaluate(BRAND);
    const { sections, height } = await page.evaluate(SECTIONS);
    const stops = planStops(sections, height);
    // A section the homepage only links to: its own page, photographed too.
    const found = new Set(stops.map((s) => s.key));
    const away = [];
    for (const key of ["pricing", "features"]) {
      if (found.has(key)) continue;
      const re = key === "pricing" ? /pric|plans/i : /features?/i;
      const link = (info.navLinks || []).find((l) => re.test(l.text) && sameSite(l.href, url) && !/#/.test(l.href) && new URL(l.href).pathname !== new URL(url).pathname);
      if (link) away.push({ key, href: link.href, label: link.text });
    }
    const total = stops.length + away.length;
    const shots = [];
    let n = 0;
    for (const stop of stops) {
      const shot = await shoot(page, dir, { y: stop.y, id: `s${shots.length + 1}`, label: stop.label, key: stop.key, skipPinned: shots.length > 0, url });
      onProgress(++n / total);
      if (shot.blank) {
        log(`  dropped a blank shot at ${shot.scrollY}px (${shot.label}, fill ${shot.fill.toFixed(2)})`);
        continue;
      }
      shots.push(shot);
      lap(`shot ${shot.id} ${stop.key || ""} "${stop.label.slice(0, 30)}" fill ${shot.fill}, ${shot.ready ? "settled" : "NOT settled"} after ${(shot.waited / 1000).toFixed(1)}s${shot.issues.length ? ` (${shot.issues.join(", ")})` : ""}`);
    }
    // The logo is taken while the homepage is open (the wordmark is a photograph of its header).
    const logos = await collectLogos(page, info, dir);
    for (const a of away.slice(0, 2)) {
      try {
        await loadPage(page, a.href, lap);
        const { sections: secs } = await page.evaluate(SECTIONS);
        const s = secs.find((x) => x.key === a.key);
        const shot = await shoot(page, dir, { y: s ? s.y - 80 : 0, id: `s${shots.length + 1}`, label: a.label, key: a.key, skipPinned: true, url: a.href });
        if (!shot.blank) {
          shots.push(shot);
          lap(`shot ${shot.id} ${a.key} page ${a.href}`);
        }
      } catch (err) {
        log(`  ${a.key} page skipped: ${String(err.message).slice(0, 100)}`);
      }
      onProgress(++n / total);
    }
    log(`captured ${shots.length} shots, ${shots.reduce((k, s) => k + s.elements.length, 0)} elements, ${logos.length} logo candidates`);
    const { logos: headerLogos, ...brand } = info;
    return { url: page.url(), view: VIEW, brand: { ...brand, logos, logo: logos[0] || null }, shots };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * More of the same site, for a refinement: shots retaken (a blank or cut one),
 * sections not photographed yet ("the pricing"), other pages of the site, and
 * a logo the creator linked to. New shots get new ids; the ones they replace
 * are marked, so earlier versions still render as they were.
 *
 *   targets  [{ retake: "s3" } | { find: "pricing", url? }]
 */
export async function captureMore(dir, capture, { targets = [], logoUrl = "", local = false, log = () => {} } = {}) {
  await fsp.mkdir(path.join(dir, "shots"), { recursive: true });
  const { browser, where } = await openSession({ local, log });
  log(`browser: ${where} (more shots)`);
  const added = [];
  const notes = [];
  let logo = null;
  let next = capture.shots.reduce((m, s) => Math.max(m, parseInt(String(s.id).slice(1), 10) || 0), 0) + 1;
  try {
    const page = await openPage(browser);
    let open = "";
    const visit = async (u) => {
      if (open === u) return;
      await loadPage(page, u);
      open = u;
    };
    for (const t of targets.slice(0, 4)) {
      try {
        const old = t.retake ? capture.shots.find((s) => s.id === t.retake) : null;
        let u = (old && old.url) || t.url || capture.url;
        if (!sameSite(u, capture.url)) u = capture.url;
        await visit(u);
        let y = old ? old.scrollY : 0;
        let label = old ? old.label || "" : t.find || "";
        if (t.find) {
          const hit = await page.evaluate(FIND, t.find);
          if (hit) {
            y = Math.max(0, hit.y - 80);
            label = hit.text;
          } else if (!old) {
            notes.push(`couldn't find "${t.find}" on ${u}`);
            continue;
          }
        }
        const shot = await shoot(page, dir, { y, id: `s${next}`, label, key: old?.key || "", skipPinned: y > 0, url: u });
        if (shot.blank) {
          notes.push(`the ${label || "section"} still looked empty after waiting`);
          continue;
        }
        next++;
        if (old) {
          old.replacedBy = shot.id;
          shot.replaces = old.id;
        }
        added.push(shot);
        log(`  new shot ${shot.id}${old ? ` (replaces ${old.id})` : ""} "${label.slice(0, 40)}" fill ${shot.fill}`);
      } catch (err) {
        notes.push(`a shot failed: ${String(err.message).slice(0, 80)}`);
      }
    }
    if (logoUrl) {
      try {
        if (!open) await page.goto("about:blank");
        logo = await logoFromUrl(page, dir, logoUrl, `L${(capture.brand.logos || []).length + 1}`);
      } catch (err) {
        notes.push(`the logo link didn't give an image (${String(err.message).slice(0, 60)})`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  capture.shots.push(...added);
  if (logo) capture.brand.logos = [...(capture.brand.logos || []), logo];
  return { added, logo, notes };
}
