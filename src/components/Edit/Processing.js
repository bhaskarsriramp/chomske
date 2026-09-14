import { Bar, Icon, Spinner } from "./ui";

/**
 * Step two, while the matching (or, for a video on its own, the captioning)
 * runs.
 *
 * The stages are the server's own (services/edit/editRunner.js), in its order,
 * so the list says what is actually happening rather than cycling reassuring
 * phrases. The one thing worth adding is that leaving is safe: the job runs on
 * the server, and this screen is only watching it.
 */
const STAGES = {
  script: [
    ["Finding where you speak", "Finding the pauses between your lines"],
    ["Getting your speech ready", "Cutting your speech into pieces"],
    ["Listening to your recording", "Writing down what you said"],
    ["Matching to your script", "Lining it up with the script, choosing your best takes"],
  ],
  free: [
    ["Finding where you speak", "Finding where you talk and where you pause"],
    ["Getting your speech ready", "Cutting your speech into pieces"],
    ["Writing your captions", "Writing down every word, in the language you speak"],
  ],
};

export default function Processing({ project }) {
  const free = project.mode === "free";
  const stages = STAGES[free ? "free" : "script"];
  const at = stages.findIndex(([key]) => key === project.stage);
  const progress = Math.max(0.02, Number(project.progress) || 0);

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "min(520px, 100%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: "24px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Spinner size={18} />
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 750, letterSpacing: "-.02em", color: "var(--ink)" }}>
            {free ? "Writing your captions" : "Cutting your video to the script"}
          </h2>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)" }}>
          About a minute for a Short, a few for a long video. You can close this; it keeps going and your {free ? "captions" : "edit"} will be here.
        </p>

        <Bar value={progress} />

        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "grid", gap: 12 }}>
          {stages.map(([key, label], i) => {
            const done = at > i;
            const on = at === i || (at === -1 && i === 0);
            return (
              <li key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: done || on ? "var(--ink)" : "var(--ink-mute)", fontWeight: on ? 650 : 500 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                    background: done ? "var(--ink)" : "transparent", color: "#fff",
                    border: done ? "none" : `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`,
                  }}
                >
                  {done ? <Icon.Check size={12} /> : on ? <Spinner size={10} /> : null}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
