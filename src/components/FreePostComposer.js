// LinkedInFormatterEditor.js
import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import {
  Box, Grid, Card, CardContent, TextField, Stack, Typography,
  IconButton, Divider, Avatar, useMediaQuery, useTheme, Tooltip,
  Button, ToggleButtonGroup, ToggleButton, ClickAwayListener, Snackbar
} from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import IosShareIcon from "@mui/icons-material/IosShare";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import RepeatIcon from "@mui/icons-material/Repeat";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LaptopMacIcon from "@mui/icons-material/LaptopMac";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import myAvatar from "../../src/images/avatar_linkedin_400.png";
import Navbar from "./Navbar";
import Footer from "./Footer";
import BannerLandpage from "./BannerLandPage";
import { Helmet } from "react-helmet";

/** ===================== Unicode helpers (bold / italicSans + underline/strike) ===================== */
const ranges = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italicSans: { upper: 0x1d608, lower: 0x1d622 },
};
const COMB_UNDER = "\u0332";
const COMB_STRIKE_A = "\u0336"; // default
const COMB_STRIKE_B = "\u0335"; // alternate

const isAsciiLetter = (cp) => (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122);
const isAsciiDigit = (cp) => cp >= 48 && cp <= 57;
const isAsciiAlnum = (cp) => isAsciiLetter(cp) || isAsciiDigit(cp);

const mapChar = (ch, set) => {
  const code = ch.codePointAt(0);
  if (isAsciiLetter(code)) {
    const base = code <= 90 ? 65 : 97;
    const delta = code - base;
    const start = code <= 90 ? ranges[set].upper : ranges[set].lower;
    return String.fromCodePoint(start + delta);
  }
  if (isAsciiDigit(code) && ranges[set].digit) {
    return String.fromCodePoint(ranges[set].digit + (code - 48));
  }
  return ch;
};
const transformBySet = (text, set) => {
  let out = "";
  for (const ch of text) out += mapChar(ch, set);
  return out;
};

// reverse maps (styled -> plain)
const makeReverseMap = (set) => {
  const m = Object.create(null);
  for (let i = 0; i < 26; i++) {
    m[String.fromCodePoint(ranges[set].upper + i)] = String.fromCodePoint(65 + i);
    m[String.fromCodePoint(ranges[set].lower + i)] = String.fromCodePoint(97 + i);
  }
  if (ranges[set].digit) {
    for (let i = 0; i < 10; i++) {
      m[String.fromCodePoint(ranges[set].digit + i)] = String.fromCodePoint(48 + i);
    }
  }
  return m;
};

const removeCombining = (text, mark) => text.replaceAll(mark, "");
const applyCombining = (text, mark) =>
  text.split("").map((c) => (c === "\n" ? "\n" : c + mark)).join("");

// ===================== NEW: constants for your requests =====================
const MAX_CHARS = 2800;

export default function LinkedInFormatterEditor() {
  const [text, setText] = useState("");
  const [strikeStyle, setStrikeStyle] = useState("0336"); // 0336 default, 0335 alt
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copiedOpen, setCopiedOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState("desktop"); // 'desktop' | 'mobile'
  const textAreaRef = useRef(null);
  const emojiAnchorRef = useRef(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const previewBodyRef = useRef(null);

  useEffect(() => {
    setPreviewMode(isMobile ? "mobile" : "desktop");
  }, [isMobile]);

  useEffect(() => {
    setText((prev) => prev.replace(/#[^\s#]+/g, (seg) => toPlain(seg)));
  }, []);

  const [previewWidth, setPreviewWidth] = useState(0);
  const roRef = useRef(null);

  useLayoutEffect(() => {
    const container = previewBodyRef.current?.parentElement;
    if (!container) return;

    let rafId = 0;
    let last = -1;

    roRef.current = new ResizeObserver(([entry]) => {
      const w = Math.round(
        entry.contentBoxSize?.[0]?.inlineSize ??
          entry.contentRect?.width ??
          container.clientWidth
      );
      if (w === last) return;
      last = w;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPreviewWidth(w);
      });
    });

    roRef.current.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      roRef.current?.disconnect();
      roRef.current = null;
    };
  }, [previewMode]);

  // NEW: over-limit flag for color changes
  const overLimit = text.length > MAX_CHARS;

  // selection memory
  const selRef = useRef({ start: 0, end: 0 });

  // ----- Undo/Redo history -----
  const [history, setHistory] = useState([{ text: "", start: 0, end: 0 }]);
  const [histIndex, setHistIndex] = useState(0);
  const MAX_HISTORY = 200;

  const commit = (nextText, start, end) => {
    setHistory((prev) => {
      const base = prev.slice(0, histIndex + 1);
      const last = base[base.length - 1];
      if (last && last.text === nextText && last.start === start && last.end === end) {
        return base;
      }
      const appended = [...base, { text: nextText, start, end }];
      if (appended.length > MAX_HISTORY) appended.shift();
      setHistIndex(appended.length - 1);
      return appended;
    });
  };

  const restoreState = (state) => {
    setText(state.text);
    requestAnimationFrame(() => {
      const el = textAreaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(state.start, state.end);
      selRef.current = { start: state.start, end: state.end };
    });
  };

  const undo = () => {
    if (histIndex <= 0) return;
    const idx = histIndex - 1;
    setHistIndex(idx);
    restoreState(history[idx]);
  };

  const redo = () => {
    if (histIndex >= history.length - 1) return;
    const idx = histIndex + 1;
    setHistIndex(idx);
    restoreState(history[idx]);
  };

  // reverse maps (memoized)
  const reverseMaps = useMemo(
    () => ({
      bold: makeReverseMap("bold"),
      italicSans: makeReverseMap("italicSans"),
    }),
    []
  );

  const toPlain = (s) => {
    const all = [reverseMaps.bold, reverseMaps.italicSans];
    let out = "";
    for (const ch of s) {
      let repl = ch;
      for (const map of all) {
        if (map[ch]) {
          repl = map[ch];
          break;
        }
      }
      out += repl;
    }
    return out;
  };

  const isAllStyled = (s, setKey) => {
    const map = reverseMaps[setKey];
    let seen = 0;
    let styled = 0;
    for (const ch of s) {
      if (ch === "\n") continue;
      const cp = ch.codePointAt(0);
      const stylableAscii = isAsciiAlnum(cp);
      const alreadyStyled = !!map[ch];
      if (stylableAscii || alreadyStyled) {
        seen++;
        if (alreadyStyled) styled++;
      }
    }
    return seen > 0 && styled === seen;
  };

  const captureSelection = () => {
    const el = textAreaRef.current;
    if (!el) return;
    selRef.current = {
      start: el.selectionStart ?? selRef.current.start ?? 0,
      end: el.selectionEnd ?? selRef.current.end ?? 0,
    };
  };

  // UPDATED: fall back to remembered selection if live selection is collapsed
  const getSelection = () => {
    const el = textAreaRef.current;
    if (!el) return null;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    if (start == null || end == null || start === end) {
      start = selRef.current.start ?? 0;
      end = selRef.current.end ?? 0;
    }
    if (start === end) return null;
    return { el, start, end };
  };

  const replaceSelection = (newChunk) => {
    const sel = getSelection();
    if (!sel) return;
    const before = text.slice(0, sel.start);
    const after = text.slice(sel.end);
    const next = before + newChunk + after;

    const caretPos = before.length + newChunk.length;
    setText(next);
    requestAnimationFrame(() => {
      sel.el.focus();
      sel.el.setSelectionRange(caretPos, caretPos);
      selRef.current = { start: caretPos, end: caretPos };
    });
    commit(next, caretPos, caretPos);
  };

  const insertAtSelection = (insertText) => {
    const el = textAreaRef.current;
    const start = el?.selectionStart ?? selRef.current.start ?? 0;
    const end = el?.selectionEnd ?? selRef.current.end ?? start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const next = before + insertText + after;
    const caretPos = before.length + insertText.length;
    setText(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(caretPos, caretPos);
      }
      selRef.current = { start: caretPos, end: caretPos };
    });
    commit(next, caretPos, caretPos);
  };

  // ---------- Toggling actions ----------
  const toggleStyle = (setKey) => {
    const sel = getSelection();
    if (!sel) return;
    const chunk = text.slice(sel.start, sel.end);

    if (isAllStyled(chunk, setKey)) {
      const plain = Array.from(chunk).map((c) => reverseMaps[setKey][c] || c).join("");
      replaceSelection(plain);
    } else {
      const plain = toPlain(chunk);
      const styled = transformBySet(plain, setKey);
      replaceSelection(styled);
    }
  };

  const toggleUnderline = () => {
    const sel = getSelection();
    if (!sel) return;
    const chunk = text.slice(sel.start, sel.end);
    const next = chunk.includes(COMB_UNDER)
      ? removeCombining(chunk, COMB_UNDER)
      : applyCombining(chunk, COMB_UNDER);
    replaceSelection(next);
  };

  const toggleStrike = () => {
    const mark = strikeStyle === "0335" ? COMB_STRIKE_B : COMB_STRIKE_A;
    const sel = getSelection();
    if (!sel) return;
    const chunk = text.slice(sel.start, sel.end);
    const next = chunk.includes(mark)
      ? removeCombining(chunk, mark)
      : applyCombining(chunk, mark);
    replaceSelection(next);
  };

  // commit typing to history
  const onChange = (e) => {
    let val = e.target.value;
    setText(val);

    requestAnimationFrame(() => {
      const el = textAreaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? val.length;
      const end = el.selectionEnd ?? val.length;
      commit(val, start, end);
      selRef.current = { start, end };
    });
  };

  const renderHashtags = (text) => {
    const parts = text.split(/(#[\w]+)/g);
    return parts.map((part, i) =>
      /^#[\w]+$/.test(part)
        ? <span key={i} style={{ fontWeight: 500, color: "#0a66c2" }}>{part}</span>
        : part
    );
  };

  /** ===================== Preview renderer ===================== */
  const renderWithTextDecor = (raw) => {
    const STRIKE = strikeStyle === "0335" ? COMB_STRIKE_B : COMB_STRIKE_A;
    const nodes = [];
    let i = 0;
    let buf = "";
    let decoBuf = "";
    let deco = { u: false, s: false };

    const flushBuf = () => {
      if (buf) {
        nodes.push(<span key={`t-${nodes.length}`}>{buf}</span>);
        buf = "";
      }
    };
    const flushDeco = () => {
      if (decoBuf) {
        const style = {
          textDecoration: `${deco.u ? "underline" : ""} ${deco.s ? "line-through" : ""}`.trim(),
        };
        nodes.push(
          <span key={`d-${nodes.length}`} style={style}>
            {decoBuf}
          </span>
        );
        decoBuf = "";
        deco = { u: false, s: false };
      }
    };

    while (i < raw.length) {
      const ch = raw[i];
      const next = raw[i + 1];
      const next2 = raw[i + 2];

      const isUnderPair = next === COMB_UNDER;
      const isStrikePair = next === STRIKE;

      if ((isUnderPair || isStrikePair) && ch !== "\n") {
        flushBuf();
        let u = false, s = false;
        if (isUnderPair) u = true;
        if (isStrikePair) s = true;
        if (next2 === COMB_UNDER && !u) { u = true; i += 1; }
        if (next2 === STRIKE && !s) { s = true; i += 1; }

        const same = deco.u === u && deco.s === s;
        if (!same) {
          flushDeco();
          deco = { u, s };
        }
        decoBuf += ch;
        i += u && s ? 3 : 2;
        continue;
      }

      if (decoBuf) flushDeco();
      buf += ch;
      i += 1;
    }
    flushDeco();
    flushBuf();

    // Convert '\n' into <br />
    const withBreaks = [];
    nodes.forEach((n) => {
      const text = n.props.children;
      const style = n.props.style;
      const parts = String(text).split("\n");
      parts.forEach((p, j) => {
        if (p)
          withBreaks.push(
            <span key={`${n.key}-${j}`} style={style}>
              {renderHashtags(p)}
            </span>
          );
        if (j < parts.length - 1) withBreaks.push(<br key={`${n.key}-br-${j}`} />);
      });
    });
    return withBreaks;
  };

  const MAX_VISIBLE_LINES_DESKTOP = 3;
  const MAX_VISIBLE_LINES_MOBILE = 2;
  const ELLIPSIS_TEXT = " …more";

  const getTruncationIndexDOM = (raw, { el, maxLines }) => {
    if (!raw || !el) return -1;

    const cs = getComputedStyle(el);

    const measurer = document.createElement("div");
    measurer.style.position = "fixed";
    measurer.style.left = "-99999px";
    measurer.style.top = "-99999px";
    measurer.style.visibility = "hidden";
    measurer.style.width = `${el.clientWidth}px`;
    measurer.style.whiteSpace = "pre-wrap";
    measurer.style.wordBreak = cs.wordBreak || "break-word";
    measurer.style.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    measurer.style.letterSpacing = cs.letterSpacing;
    measurer.style.lineHeight = cs.lineHeight;
    document.body.appendChild(measurer);

    const sample = new Array(maxLines).fill("A").join("\n");
    measurer.textContent = sample;
    const maxHeight = measurer.getBoundingClientRect().height + 0.75;

    let lo = 0, hi = raw.length, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const prefix = raw.slice(0, mid);
      measurer.textContent = prefix + (mid < raw.length ? ELLIPSIS_TEXT : "");
      const h = measurer.getBoundingClientRect().height;

      if (h <= maxHeight) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    document.body.removeChild(measurer);

    if (ans >= raw.length) return -1;

    while (ans > 0 && /\s/.test(raw[ans - 1])) ans--;

    return Math.max(0, ans);
  };

  const renderWithMore = (raw) => {
    if (!raw) return "Your formatted post will preview here…";
    const maxLines = previewMode === "mobile" ? MAX_VISIBLE_LINES_MOBILE : MAX_VISIBLE_LINES_DESKTOP;
    const el = previewBodyRef.current;
    const cut = getTruncationIndexDOM(raw, { el, maxLines });

    if (cut < 0) return renderWithTextDecor(raw);

    const before = raw.slice(0, cut);
    const after = raw.slice(cut);
    const needsSpaceAfter = after && !/^\s/.test(after);

    return (
      <>
        {renderWithTextDecor(before)}
        <span style={{ color: "#6b7280" }}>{ELLIPSIS_TEXT.trimStart()}</span>
        {needsSpaceAfter ? " " : null}
        {renderWithTextDecor(after)}
      </>
    );
  };

  const ReactionDot = ({ icon, bg }) => (
    <Box
      sx={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: bg,
        color: "#fff",
        border: "2px solid #fff",
        boxShadow: 1,
      }}
    >
      {icon}
    </Box>
  );

  return (
    <>
      <Helmet>
        <title>Free LinkedIn Text Formatter | Bold, Italic & Stylish Posts | PostLn</title>
        <meta
          name="description"
          content="Format LinkedIn posts with bold, italic, underline & more. 100% free tool — no ads, no tracking. Make your posts stand out & boost engagement."
        />
        <meta property="og:title" content="Free LinkedIn Text Formatter | Bold, Italic & Stylish Posts | PostLn" />
        <meta
          property="og:description"
          content="Format LinkedIn posts with bold, italic, underline & more. 100% free tool — no ads, no tracking. Make your posts stand out & boost engagement."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://www.postln.com/linkedin-text-formatter" />
      </Helmet>

      <Navbar />
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: "auto", mt: isMobile ? 6 : 4 }}>
        {/* Centered hero */}
        <Stack
          sx={{
            p: { xs: 2, md: 3 },
            textAlign: "center",
            alignItems: "center",
            justifyContent: "center",
            mx: "auto",
            maxWidth: 800,
            borderRadius: 2,
            mb: 4,
          }}
          spacing={2}
        >
          <Typography sx={{ fontFamily: "Inter", fontSize: isMobile ? "22px" : "32px", fontWeight: 500 }}>
            LinkedIn Text Formatter
          </Typography>

          <Typography sx={{ maxWidth: 600, fontSize: "15px" }}>
            Format your LinkedIn posts with bold, italic, underline, #hashtags and more — completely free, with no ads
            or tracking.
          </Typography>
        </Stack>

        <Grid container spacing={3}>
          {/* LEFT: Editor */}
          <Grid item xs={12} md={6} lg={6}>
            <Card sx={{ borderRadius: 3, position: "relative" }}>
              <CardContent>
                {/* Toolbar */}
                <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <Tooltip title="Bold (Ctrl/Cmd + B)">
                    <span>
                      <IconButton
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={() => toggleStyle("bold")}
                      >
                        <FormatBoldIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Italic Sans (Ctrl/Cmd + I)">
                    <span>
                      <IconButton
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={() => toggleStyle("italicSans")}
                      >
                        <FormatItalicIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Underline (Ctrl/Cmd + U) — LinkedIn may render it dashed or omit it">
                    <span>
                      <IconButton
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={toggleUnderline}
                      >
                        <FormatUnderlinedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Strikethrough (try 0335 vs 0336)">
                    <span>
                      <IconButton
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={toggleStrike}
                      >
                        <StrikethroughSIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  {/* Emoji */}
                  <Tooltip title="Insert emoji">
                    <span>
                      <IconButton
                        ref={emojiAnchorRef}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={() => {
                          captureSelection();
                          setShowEmojiPicker((v) => !v);
                        }}
                      >
                        <InsertEmoticonIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Box sx={{ flexGrow: 1 }} />

                  {/* Copy Text button */}
                  <Tooltip title="Copy formatted text">
                    <span>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          captureSelection();
                        }}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(text || "");
                            setCopiedOpen(true);
                          } catch (e) {
                            const ta = document.createElement("textarea");
                            ta.value = text || "";
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand("copy");
                            document.body.removeChild(ta);
                            setCopiedOpen(true);
                          }
                        }}
                        sx={{ fontSize: "10px", fontWeight: 600, color: "grey" }}
                      >
                        Copy
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>

                {/* Emoji picker */}
                {showEmojiPicker && (
                  <ClickAwayListener onClickAway={() => setShowEmojiPicker(false)}>
                    <Box
                      sx={{
                        position: "absolute",
                        zIndex: 10,
                        top: 56,
                        right: 12,
                        maxWidth: "100%",
                      }}
                    >
                      <Picker
                        data={data}
                        onEmojiSelect={(emoji) => {
                          const ch = emoji?.native ?? "";
                          if (!ch) return;
                          insertAtSelection(ch);
                          setShowEmojiPicker(false);
                        }}
                        theme="light"
                      />
                    </Box>
                  </ClickAwayListener>
                )}

                <TextField
                  inputRef={textAreaRef}
                  placeholder="Write your LinkedIn post here…"
                  multiline
                  minRows={12}
                  fullWidth
                  value={text}
                  onChange={onChange}
                  onMouseDown={captureSelection}
                  onSelect={captureSelection}
                  onKeyUp={captureSelection}
                  onClick={captureSelection}
                  onKeyDown={(e) => {
                    const isMod = e.ctrlKey || e.metaKey;
                    if (!isMod) return;
                    const key = e.key.toLowerCase();
                    if (key === "b") {
                      e.preventDefault();
                      captureSelection();
                      toggleStyle("bold");
                    } else if (key === "i") {
                      e.preventDefault();
                      captureSelection();
                      toggleStyle("italicSans");
                    } else if (key === "u") {
                      e.preventDefault();
                      captureSelection();
                      toggleUnderline();
                    } else if (key === "z") {
                      e.preventDefault();
                      e.shiftKey ? redo() : undo();
                    } else if (key === "y") {
                      e.preventDefault();
                      redo();
                    }
                  }}
                  InputProps={{ sx: { fontSize: 16, color: overLimit ? "error.main" : "inherit" } }}
                />

                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: overLimit ? "error.main" : "text.secondary" }}>
                    {`${text.length}/${MAX_CHARS}`} characters
                  </Typography>
                </Stack>

                <Snackbar
                  open={copiedOpen}
                  autoHideDuration={2000}
                  onClose={() => setCopiedOpen(false)}
                  message="Text copied to clipboard"
                />
              </CardContent>
            </Card>
          </Grid>

          {/* RIGHT: LinkedIn Post Simulator */}
          <Grid item xs={12} md={6} lg={6}>
            <Box sx={{ border: "1px solid grey", pb: 2, borderRadius: 3, px: 2, py: 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography sx={{ fontFamily: "Inter", fontSize: "15px", fontWeight: 500, color: "grey" }}>
                  Post Preview
                </Typography>

                {!isMobile && (
                  <ToggleButtonGroup
                    size="small"
                    value={previewMode}
                    exclusive
                    onChange={(_, v) => v && setPreviewMode(v)}
                  >
                    <ToggleButton value="mobile">
                      <PhoneIphoneIcon fontSize="small" sx={{ mr: 1 }} />
                    </ToggleButton>
                    <ToggleButton value="desktop">
                      <LaptopMacIcon fontSize="small" sx={{ mr: 1 }} />
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>

              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Card sx={{ borderRadius: 3, width: "100%", maxWidth: previewMode === "mobile" ? 380 : 680 }}>
                  <CardContent>
                    {/* Header */}
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                      <Avatar alt="Profile" src={myAvatar} sx={{ width: 48, height: 48 }} />
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography sx={{ fontFamily: "Inter", fontWeight: 600 }}>Bhaskar Sriram</Typography>
                          <CheckCircleOutlineIcon fontSize="small" sx={{ color: "primary.main" }} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Founder @PostLn.com -LinkedIn AI That Writes Like You.
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary">12h</Typography>
                          <PublicOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                        </Stack>
                      </Box>
                    </Stack>

                    {/* Body */}
                    <Typography
                      key={previewMode}
                      ref={previewBodyRef}
                      sx={{
                        fontSize: 16,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
                      }}
                    >
                      {previewWidth ? (text ? renderWithMore(text) : "Your formatted post will preview here…") : null}
                    </Typography>

                    <Box sx={{ my: 2 }}>
                      <Divider />
                    </Box>

                    {/* Social counts */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ position: "relative", width: 44, height: 20, mr: 0.5 }}>
                          <Box sx={{ position: "absolute", left: 0 }}>
                            <ReactionDot icon={<ThumbUpOffAltIcon sx={{ fontSize: 12 }} />} bg="#0a66c2" />
                          </Box>
                          <Box sx={{ position: "absolute", left: 14 }}>
                            <ReactionDot icon={<FavoriteBorderIcon sx={{ fontSize: 12 }} />} bg="#e63946" />
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary">57</Typography>
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Typography variant="caption" color="text.secondary">24 comments</Typography>
                        <Typography variant="caption" color="text.secondary">•</Typography>
                        <Typography variant="caption" color="text.secondary">6 reposts</Typography>
                      </Stack>
                    </Stack>

                    <Box sx={{ mt: 1 }}>
                      <Divider />
                    </Box>

                    {/* Actions */}
                  <Stack
  direction="row"
  alignItems="center"
  justifyContent="space-between"
  sx={{ mt: 1 }}
>
  <Action text="Like" icon={<ThumbUpOffAltIcon fontSize="small" />} />
  <Action text="Comment" icon={<FavoriteBorderIcon fontSize="small" />} />
  <Action text="Repost" icon={<RepeatIcon fontSize="small" />} />
  <Action text="Send" icon={<SendOutlinedIcon fontSize="small" />} />
</Stack>

                  </CardContent>
                </Card>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
      <BannerLandpage />
      <Footer />
    </>
  );
}

function Action({ icon, text }) {
  return (
    <Stack
      direction="column"
      spacing={0.5}
      alignItems="center"
      justifyContent="center"
    >
      {icon}
      <Typography variant="caption" color="text.secondary">
        {text}
      </Typography>
    </Stack>
  );
}

