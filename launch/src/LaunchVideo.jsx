/**
 * LaunchVideo.jsx: a storyboard, played.
 *
 * ── THE STORYBOARD IS THE WHOLE VIDEO ────────────────────────────────────────
 * Nothing here decides anything. The board says which scenes, in what order,
 * with which words, which screenshot and how long each runs (the voice line's
 * own length, measured when it was spoken). A refinement in chat changes the
 * board and the video follows, so the same board always renders the same film.
 *
 * ── SCENES OVERLAP BY A BEAT ─────────────────────────────────────────────────
 * Each scene starts OVERLAP frames before the last one ends, while the last
 * one blurs and fades away (Shell). The background is under all of them, so a
 * cut is never a flash of nothing.
 */
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { themeOf } from "./theme";
import { FPS, OVERLAP, VOICE_LEAD, placeScenes, durationOf } from "./placement";
import { useBrandFont } from "./fonts";
import { Background } from "./parts/Background";
import { Captions } from "./parts/Captions";
import { clamp } from "./motion";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Reveal } from "./scenes/Reveal";
import { Feature } from "./scenes/Feature";
import { Features } from "./scenes/Features";
import { Stats } from "./scenes/Stats";
import { Quote } from "./scenes/Quote";
import { Cta } from "./scenes/Cta";

const SCENES = { hook: Hook, problem: Problem, reveal: Reveal, feature: Feature, features: Features, stats: Stats, quote: Quote, cta: Cta };

export { FPS, durationOf };

const Shell = ({ dur, last, children }) => {
  const frame = useCurrentFrame();
  const out = last ? 0 : interpolate(frame, [dur - OVERLAP - 2, dur], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0 ? `blur(${out * 14}px)` : undefined, transform: `scale(${1 + out * 0.04})` }}>
      {children}
    </AbsoluteFill>
  );
};

/**
 * The score, ducked under the voice: full between lines and at the ends, low
 * while someone is speaking, with short ramps so the dips are felt, not heard.
 */
const MUSIC_UP = 0.34;
const MUSIC_UNDER = 0.11;
const Music = ({ board, placed, total }) => {
  const spans = placed
    .filter((p) => p.scene.audio && p.scene.voiceSeconds)
    .map((p) => [p.from + VOICE_LEAD, p.from + VOICE_LEAD + Math.round(p.scene.voiceSeconds * FPS)]);
  const up = board.musicVolume ?? MUSIC_UP;
  const volume = (f) => {
    let duck = 0;
    for (const [a, b] of spans) duck = Math.max(duck, interpolate(f, [a - 9, a, b, b + 14], [0, 1, 1, 0], clamp));
    const ends = interpolate(f, [0, 12, total - 50, total - 2], [0, 1, 1, 0], clamp);
    return ends * (up - (up - MUSIC_UNDER) * duck);
  };
  return <Audio src={staticFile(board.music)} volume={volume} />;
};

export const LaunchVideo = ({ board }) => {
  const brand = board?.brand || {};
  const theme = themeOf(brand);
  const fontFamily = useBrandFont(brand.font);
  const placed = placeScenes(board);
  const total = durationOf(board);
  let featureIndex = 0;
  return (
    <AbsoluteFill style={{ fontFamily, color: theme.ink, WebkitFontSmoothing: "antialiased" }}>
      <Background theme={theme} />
      {placed.map(({ scene, from, dur }, i) => {
        const Scene = SCENES[scene.type];
        const index = scene.type === "feature" ? featureIndex++ : 0;
        return (
          <Sequence key={scene.id || i} from={from} durationInFrames={dur} name={`${i + 1}. ${scene.type}`}>
            <Shell dur={dur} last={i === placed.length - 1}>
              <Scene scene={scene} theme={theme} brand={brand} dur={dur} index={index} />
            </Shell>
            {scene.audio ? (
              <Sequence from={VOICE_LEAD} name="voice">
                <Audio src={staticFile(scene.audio)} />
              </Sequence>
            ) : null}
          </Sequence>
        );
      })}
      {board?.captions ? <Captions placed={placed} theme={theme} lead={VOICE_LEAD} /> : null}
      {board?.music ? <Music board={board} placed={placed} total={total} /> : null}
    </AbsoluteFill>
  );
};
