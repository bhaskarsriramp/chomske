/**
 * fonts.js: the typefaces a video can be set in.
 *
 * A short list on purpose. The site's own font is often licensed or
 * self-hosted, so the director picks the closest of these by feel (geometric,
 * grotesk, humanist…), and every one of them is known to look right at the
 * sizes the scenes use. Only the chosen family is ever downloaded.
 */
import { useState } from "react";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as geist } from "@remotion/google-fonts/Geist";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as jakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as sora } from "@remotion/google-fonts/Sora";
import { loadFont as outfit } from "@remotion/google-fonts/Outfit";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as urbanist } from "@remotion/google-fonts/Urbanist";

export const FONTS = {
  Inter: inter,
  Geist: geist,
  Manrope: manrope,
  "Plus Jakarta Sans": jakarta,
  "DM Sans": dmSans,
  "Space Grotesk": spaceGrotesk,
  Sora: sora,
  Outfit: outfit,
  Poppins: poppins,
  Urbanist: urbanist,
};

export const FONT_NAMES = Object.keys(FONTS);

export function useBrandFont(name) {
  const [family] = useState(() => {
    const load = FONTS[name] || FONTS.Inter;
    const { fontFamily } = load("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
    return `${fontFamily}, Inter, system-ui, sans-serif`;
  });
  return family;
}
