import { Section, Segmented } from "./ui";

/**
 * Captions. Most Shorts are watched on mute, so they are on by default, in the
 * letters the creator reads fastest, and they follow what was SAID rather than
 * the script: a caption that reads a sentence the creator never spoke is the
 * fastest way to look auto-generated.
 */
export default function CaptionsPanel({ tl, onChange, nativeLabel, hasRoman }) {
  const cap = tl.captions || {};
  const set = (field) => (value) => onChange((d) => { d.captions = { ...d.captions, [field]: value }; });

  return (
    <div>
      <Section title="Captions">
        <Segmented
          full
          label="Captions"
          value={cap.mode}
          onChange={set("mode")}
          options={[
            { value: "off", label: "Off" },
            ...(hasRoman ? [{ value: "roman", label: "Roman" }] : []),
            { value: "native", label: nativeLabel || "Original", indic: /[ऀ-෿]/.test(nativeLabel || "") },
          ]}
        />
      </Section>

      {cap.mode !== "off" && (
        <>
          <Section title="Words">
            <Segmented
              full
              label="Caption words"
              value={cap.source}
              onChange={set("source")}
              options={[
                { value: "said", label: "What you said", title: "Matches your voice, even where you went off script" },
                { value: "script", label: "The script", title: "The written lines, word for word" },
              ]}
            />
          </Section>

          <Section title="Look">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
              {[
                ["bold", "Bold", { color: "#fff", fontWeight: 800, textShadow: "1.5px 0 #000,-1.5px 0 #000,0 1.5px #000,0 -1.5px #000" }],
                ["clean", "Clean", { color: "#fff", fontWeight: 700, textShadow: "0 1px 5px rgba(0,0,0,.8)" }],
                ["box", "Box", { color: "#fff", fontWeight: 700, background: "rgba(0,0,0,.7)", padding: "2px 6px", borderRadius: 4 }],
              ].map(([value, label, look]) => {
                const on = cap.style === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("style")(value)}
                    style={{
                      border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, borderRadius: 10, padding: 0, overflow: "hidden",
                      cursor: "pointer", background: "var(--card)", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ display: "grid", placeItems: "center", height: 54, background: "linear-gradient(135deg,#6B7F95,#C9A27A)" }}>
                      <span style={{ fontSize: 14, ...look }}>Sale leak</span>
                    </span>
                    <span style={{ display: "block", padding: "6px 0", fontSize: 12, fontWeight: 600, color: on ? "var(--ink)" : "var(--ink-mute)" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Section title="Position" style={{ marginBottom: 0 }}>
              <Segmented label="Caption position" value={cap.position} onChange={set("position")} options={[{ value: "bottom", label: "Bottom" }, { value: "middle", label: "Middle" }]} />
            </Section>
            <Section title="Size" style={{ marginBottom: 0 }}>
              <Segmented label="Caption size" value={cap.size} onChange={set("size")} options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
