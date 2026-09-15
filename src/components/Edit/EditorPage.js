import { useState, useEffect, useCallback, useRef } from "react";
import { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import { onLiveEvent } from "../../realtime/socket";
import { getProject, getEditConfig, startUpload, resumeUpload, completeUpload } from "./editApi";
import { uploadFile, waitForNetwork } from "./uploads";
import SetupStep from "./SetupStep";
import Processing from "./Processing";
import Workspace from "./Workspace";
import { Btn, Icon, Spinner } from "./ui";

/**
 * The editor: one video being edited, cut to a script or uploaded on its own.
 *
 * ── THREE SCREENS, CHOSEN BY THE PROJECT, NOT BY A WIZARD ────────────────────
 *   setup       upload the video, see what happens next
 *   processing  the matching, or the captioning, is running
 *   workspace   there is an edit
 * Which one shows is read off the project on every load. A creator who closes
 * the tab mid-match and comes back tomorrow lands on the right screen without
 * the app remembering anything.
 *
 * ── UPLOADS LIVE HERE ────────────────────────────────────────────────────────
 * Not in the setup screen, because the workspace uploads too (B-roll, music),
 * and an upload that dies when the creator switches screens is an upload they
 * have to start again on a phone connection. For the same reason a dropped
 * connection only pauses one (uploads.js): it shows as waiting, and carries on
 * from the last byte the server holds when the network is back.
 *
 * Kept fresh two ways: the server's edit:update events over the shared socket,
 * and a poll while anything is running, because a socket is an improvement and
 * never a dependency (see realtime/socket.js).
 */
export default function EditorPage({ projectId, onExit }) {
  const isNarrow = useIsMobile(1023);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const live = useRef(true);
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const d = await getProject(projectId);
      if (live.current) {
        setData(d);
        setLoadError("");
      }
    } catch (err) {
      if (live.current) setLoadError(errorMessage(err, "Couldn't open this video."));
    }
  }, [projectId]);

  useEffect(() => {
    live.current = true;
    setData(null);
    setShowSetup(false);
    load();
    return () => {
      live.current = false;
      clearTimeout(reloadTimer.current);
    };
  }, [load]);

  useEffect(() => {
    getEditConfig().then(setConfig).catch(() => {});
  }, []);

  // Back online: whatever the server finished meanwhile (a preview, captions,
  // an export) shows at once, not on the next poll.
  useEffect(() => {
    const back = () => load();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [load]);

  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 350);
  }, [load]);

  useEffect(
    () => onLiveEvent("edit:update", (e) => { if (e?.project === projectId) scheduleReload(); }),
    [projectId, scheduleReload]
  );

  const project = data?.project;
  const working = !!project && (
    project.status === "analysing" ||
    project.translation?.status === "running" ||
    project.media.some((m) => m.status === "uploaded" || m.status === "processing") ||
    project.renders.some((r) => r.status === "queued" || r.status === "rendering")
  );
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [working, load]);

  // Leaving mid-upload loses the upload. Say so before it happens.
  const uploading = uploads.some((u) => u.status !== "failed");
  useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const patchUpload = useCallback((key, fields) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...fields } : u)));
  }, []);

  // Resolves once the server has answered. A request lost to the network is sent
  // again when the connection is back, for as long as it takes; one refused by
  // a busy or restarting server (5xx) a few times more. Anything else the server
  // said is its answer. Safe for starting and finishing an upload, which the
  // server treats as the same request when it arrives twice.
  const persist = useCallback(async (fn, onWaiting) => {
    let waited = false;
    for (let failures = 1; ; failures++) {
      try {
        const out = await fn();
        if (waited) onWaiting(false);
        return out;
      } catch (err) {
        const status = err?.response?.status || 0;
        const lost = !err?.response && err?.code !== "ERR_CANCELED";
        const busy = status >= 500 || status === 408 || status === 429;
        if (!lost && !(busy && failures < 6)) {
          if (waited) onWaiting(false);
          throw err;
        }
        waited = true;
        onWaiting(true);
        await waitForNetwork(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
      }
    }
  }, []);

  const runUpload = useCallback(async (item) => {
    const it = { ...item };
    const waiting = (on) => patchUpload(it.key, { waiting: on });
    const progress = (p) => patchUpload(it.key, { progress: p });
    try {
      let upload = null;
      let done = false;
      if (!it.mediaId) {
        const started = await persist(
          () => startUpload(projectId, { filename: it.file.name, mime: it.file.type, size: it.file.size, kind: it.kind, clientKey: it.key }),
          waiting
        );
        it.mediaId = started.media_id;
        upload = started.upload;
        done = !!started.done;
        patchUpload(it.key, { mediaId: it.mediaId, status: "uploading" });
        // A file uploaded into a particular place (a B-roll moment, the music, a
        // spot between two parts) is put there once it is ready (Workspace.js).
        it.opts?.onMedia?.(it.mediaId);
      } else {
        // Carrying on: the server hands back the session that holds what arrived.
        patchUpload(it.key, { status: "uploading", error: "" });
        const resumed = await persist(() => resumeUpload(projectId, it.mediaId), waiting);
        upload = resumed.upload;
        done = !!resumed.done;
      }

      const send = () => uploadFile(it.file, upload, { onProgress: progress, onWaiting: waiting });
      if (!done && upload) await send();
      patchUpload(it.key, { status: "finishing", progress: 1 });

      let d = null;
      for (let tries = 0; !d; tries++) {
        try {
          d = await persist(() => completeUpload(projectId, it.mediaId), waiting);
        } catch (err) {
          // The store holds less than the whole file: send the rest, then ask again.
          if (err?.response?.status !== 409 || typeof err.response.data?.received !== "number" || !upload || tries >= 2) throw err;
          patchUpload(it.key, { status: "uploading" });
          await send();
          patchUpload(it.key, { status: "finishing", progress: 1 });
        }
      }
      if (live.current) setData(d);
      setUploads((list) => list.filter((u) => u.key !== it.key));
    } catch (err) {
      patchUpload(it.key, { status: "failed", waiting: false, error: err?.response ? errorMessage(err) : err?.message || "Upload failed." });
      scheduleReload();
    }
  }, [projectId, patchUpload, persist, scheduleReload]);

  const addFiles = useCallback(async (files, kind, opts = {}) => {
    const items = Array.from(files || []).map((file) => ({
      key: uploadKey(), file, name: file.name, size: file.size, kind, opts,
      mediaId: null, progress: 0, status: "starting", error: "", waiting: false,
    }));
    if (!items.length) return;
    setUploads((list) => [...list, ...items]);

    // Two at a time: enough to use a good connection, few enough that a phone
    // on 4G does not stall every upload at once.
    const queue = items.slice();
    const worker = async () => {
      while (queue.length) await runUpload(queue.shift());
    };
    await Promise.all([worker(), worker()]);
    scheduleReload();
  }, [runUpload, scheduleReload]);

  // Retry carries on the same upload: the server keeps what already arrived.
  const retryUpload = useCallback((key) => {
    const it = uploads.find((u) => u.key === key);
    if (!it) return;
    patchUpload(key, { status: it.mediaId ? "uploading" : "starting", error: "", waiting: false });
    runUpload(it);
  }, [uploads, patchUpload, runUpload]);

  // An upload cut off by a closed tab or a reload: the same file, chosen again,
  // carries on from what the server already holds.
  const resumeFile = useCallback((media, file) => {
    const it = {
      key: uploadKey(), file, name: file.name, size: file.size, kind: media.kind, opts: {},
      mediaId: media.id, progress: 0, status: "uploading", error: "", waiting: false,
    };
    setUploads((list) => [...list, it]);
    runUpload(it).then(scheduleReload);
  }, [runUpload, scheduleReload]);

  const dismissUpload = useCallback((key) => setUploads((list) => list.filter((u) => u.key !== key)), []);

  const shell = (children) => (
    <div
      className="hg-fade"
      style={{ position: "fixed", inset: 0, zIndex: 55, background: "var(--paper)", display: "flex", flexDirection: "column" }}
    >
      {children}
    </div>
  );

  if (!projectId || (loadError && !data)) {
    return shell(
      <Centered>
        <div style={{ fontSize: 16, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
          {projectId ? "This video couldn't be opened" : "No video selected"}
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-mute)", margin: "0 0 16px" }}>{loadError || "Open one from Edit videos or from a script."}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {projectId && <Btn onClick={load}>Try again</Btn>}
          <Btn kind="primary" onClick={onExit}>Back</Btn>
        </div>
      </Centered>
    );
  }

  if (!data) {
    return shell(
      <Centered>
        <Spinner size={22} />
        <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--ink-mute)" }}>Opening your video…</div>
      </Centered>
    );
  }

  const free = project.mode === "free";

  if (project.purged) {
    return shell(
      <>
        <Header title={project.headline} onExit={onExit} mode={project.mode} />
        <Centered>
          <div style={{ fontSize: 16, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>These files have expired</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 16px", maxWidth: 420 }}>
            Footage is kept for {config?.limits?.retention_days || 7} days after a video was last touched.{" "}
            {free
              ? "Start a new project from Edit videos and upload the video again."
              : "Open the script again and start a new edit to upload the recording again."}
          </p>
          <Btn kind="primary" onClick={onExit}>Back</Btn>
        </Centered>
      </>
    );
  }

  const hasEdit = !!project.timeline && project.status !== "analysing";

  if (project.status === "analysing") {
    return shell(
      <>
        <Header title={project.headline} onExit={onExit} step={2} mode={project.mode} />
        <Processing project={project} />
      </>
    );
  }

  if (hasEdit && !showSetup) {
    return shell(
      <Workspace
        key={project.id}
        data={data}
        config={config}
        isNarrow={isNarrow}
        uploads={uploads}
        onAddFiles={addFiles}
        onRetryUpload={retryUpload}
        onDismissUpload={dismissUpload}
        onData={setData}
        onReload={load}
        onExit={onExit}
        onRecordings={() => setShowSetup(true)}
      />
    );
  }

  return shell(
    <>
      <Header title={project.headline} onExit={onExit} step={1} mode={project.mode} />
      <SetupStep
        data={data}
        config={config}
        isNarrow={isNarrow}
        uploads={uploads}
        onAddFiles={addFiles}
        onRetryUpload={retryUpload}
        onDismissUpload={dismissUpload}
        onResumeUpload={resumeFile}
        onData={setData}
        onReload={load}
        hasEdit={hasEdit}
        onBackToEdit={() => setShowSetup(false)}
      />
    </>
  );
}

const uploadKey = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function Centered({ children }) {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>{children}</div>
    </div>
  );
}

/** The bar for the two screens before there is an edit. The workspace has its own. */
export function Header({ title, onExit, step = 0, right = null, mode = "script" }) {
  const steps = mode === "free" ? ["Upload", "Captions", "Edit"] : ["Upload", "Match", "Edit"];
  return (
    <header
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: "1px solid var(--line)", background: "var(--card)", minHeight: 56,
      }}
    >
      <Btn kind="quiet" size="s" onClick={onExit} aria-label="Back" icon={<Icon.Back />} style={{ padding: "6px 8px" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          Edit video
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title || "Untitled"}
        </div>
      </div>
      {step > 0 && (
        <ol aria-label="Steps" style={{ display: "flex", gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((s, i) => {
            const n = i + 1;
            const on = n === step;
            const done = n < step;
            return (
              <li
                key={s}
                aria-current={on ? "step" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                  color: on ? "var(--ink)" : "var(--ink-mute)",
                }}
              >
                <span
                  style={{
                    width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11,
                    background: on || done ? "var(--ink)" : "transparent", color: on || done ? "#fff" : "var(--ink-mute)",
                    border: on || done ? "none" : "1px solid var(--line)",
                  }}
                >
                  {done ? <Icon.Check size={11} /> : n}
                </span>
                <span className="hg-hide-narrow">{s}</span>
              </li>
            );
          })}
        </ol>
      )}
      {right}
    </header>
  );
}
