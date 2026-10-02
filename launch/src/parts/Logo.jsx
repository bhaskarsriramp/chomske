/**
 * Logo.jsx: the brand's own mark when the site gave us one, a monogram in the
 * brand gradient when it did not. Never a drawn guess at their logo.
 */
import { Img, staticFile } from "remotion";

export const Logo = ({ brand, theme, size = 96, style }) => {
  if (brand.logo) {
    return (
      <div
        style={{
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...(brand.logoPlate
            ? { background: brand.logoPlate === "dark" ? "#111114" : "#fff", borderRadius: size * 0.24, padding: size * 0.16, boxShadow: theme.shadow }
            : null),
          ...style,
        }}
      >
        <Img
          src={staticFile(brand.logo)}
          style={{
            height: brand.logoPlate ? size * 0.68 : size,
            width: "auto",
            objectFit: "contain",
            // An app icon's square corners, rounded the way a phone shows it.
            ...(brand.logoRound ? { borderRadius: size * 0.225, boxShadow: theme.shadow } : null),
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundImage: theme.gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.52,
        letterSpacing: "-0.04em",
        boxShadow: theme.shadow,
        ...style,
      }}
    >
      {String(brand.name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
};
