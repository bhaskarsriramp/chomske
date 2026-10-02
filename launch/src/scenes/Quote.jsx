/**
 * Quote: one real testimonial from the site, word for word, with who said it.
 * Only ever filled from the site's own text.
 */
import { AbsoluteFill } from "remotion";
import { Words, Fade } from "../parts/Words";

export const Quote = ({ scene, theme }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 220px", gap: 54 }}>
    <Fade delay={0} style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 220, lineHeight: 0.8, fontWeight: 700, backgroundImage: theme.gradient, WebkitBackgroundClip: "text", color: "transparent", height: 100 }}>
      “
    </Fade>
    <Words text={scene.quote} accent={scene.accent} theme={theme} size={64} weight={500} align="center" delay={4} stagger={2} lineHeight={1.18} tracking={-0.025} maxWidth={1400} />
    <Fade delay={22} style={{ fontSize: 30, color: theme.body, textAlign: "center" }}>
      <span style={{ color: theme.ink, fontWeight: 600 }}>{scene.author}</span>
      {scene.role ? ` · ${scene.role}` : ""}
    </Fade>
  </AbsoluteFill>
);
