import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";
import "./landing.css";

const SIGN_IN = "get-started";
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const goToSignIn = () => document.getElementById(SIGN_IN)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });

export default function LandingPage({ onSignedIn, checking }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn({ credential }) {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/google", { credential });
      onSignedIn(data.user);
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="demo-page">
    <Header />
    <Hero onCredential={signIn} onError={() => setError("Google sign-in was cancelled or blocked.")} busy={busy || checking} error={error} />
    <Proof />
    <HowItWorks />
    <EditStory />
    <Deliver />
    <Trust />
    <Cta busy={busy || checking} />
    <Footer />
  </main>;
}

function Header() {
  return <header className="demo-nav">
    <a className="demo-logo" href="#top" aria-label="Lipi Demo Studio, back to top"><Logo size={27} color="currentColor" /><span>Demo Studio</span></a>
    <nav aria-label="Main navigation"><a href="#how">How it works</a><a href="#edits">AI editing</a><a href="#privacy">Privacy</a></nav>
    <button type="button" className="demo-nav__cta" onClick={goToSignIn}>Start recording <Arrow /></button>
  </header>;
}

function Hero({ onCredential, onError, busy, error }) {
  return <section className="demo-hero" id="top"><div className="demo-wrap">
    <div className="demo-hero__topline"><span>TRYLIPI / 01</span><span>LOCAL-FIRST DEMO RECORDER</span></div>
    <div className="demo-hero__copy"><p className="demo-kicker"><i /> For teams who care how the product feels</p><h1>Make your product<br /><em>impossible to miss.</em></h1><p>Record a real product flow once. Lipi turns every click, pause and screen change into a clear, polished demo your customers can follow.</p></div>
    <div className="demo-hero__bottom"><div id={SIGN_IN} className="demo-signin"><div data-busy={busy}><GoogleLogin onSuccess={onCredential} onError={onError} text="continue_with" shape="pill" size="large" width="250" /></div>{error && <p role="alert">{error}</p>}</div><button className="demo-link" type="button" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" })}>See the recording flow <Arrow /></button><p className="demo-hero__note">One recording. No manual timeline.</p></div>
    <RecorderVisual />
  </div></section>;
}

function RecorderVisual() {
  return <div className="recorder" aria-label="Preview of the Lipi desktop recording studio">
    <div className="recorder__head"><span>Lipi</span><span className="recorder__live"><i /> Recording locally</span><span>01:42</span></div>
    <div className="recorder__stage"><div className="recorder__app"><div className="recorder__appbar"><b>atlas</b><span>Home</span><span>Projects</span><span>People</span><i /><button type="button" tabIndex={-1}>Invite team</button></div><div className="recorder__appbody"><div><small>WORKSPACE</small><h3>Good morning, Maya.</h3><p>Everything is moving in the right direction.</p></div><section><small>ACTIVE PROJECTS</small><b>24</b><em>↗ 12%</em></section><div className="recorder__rows"><i /><i /><i /></div></div></div><span className="recorder__cursor"><Cursor /></span><p className="recorder__caption"><b>03</b> Invite your team to the workspace</p></div>
    <div className="recorder__timeline"><span><Play /> 00:18</span><div><i /><i /><i /><i /><b /></div><small>01:42</small></div>
    <aside className="recorder__panel"><header><Spark /> <b>AI edit</b><span>ready</span></header><p>Lipi found a clean product story in this recording.</p><ol><li><i>01</i> Open the workspace</li><li><i>02</i> Review active projects</li><li className="is-current"><i>03</i> Invite your team</li><li><i>04</i> Share the update</li></ol><button type="button" tabIndex={-1}>Create first cut <Arrow /></button></aside>
  </div>;
}

function Proof() {
  return <section className="demo-proof"><div className="demo-wrap"><p>Everything a great demo needs. Nothing it does not.</p><div><span><Check /> Native desktop capture</span><span><Check /> Event-driven story</span><span><Check /> AI-assisted editing</span><span><Check /> FFmpeg final render</span></div></div></section>;
}

function HowItWorks() {
  const steps = [
    ["01", "Record the way you already work.", "Press one button. Lipi captures the screen locally and records the context behind it: clicks, key commands, scrolls, active windows and time.", "record"],
    ["02", "Let the product explain itself.", "Gemini studies sampled frames and the event trail together. It spots the meaningful moments and drafts a tutorial that follows the way your product actually works.", "spark"],
    ["03", "Give people the short version.", "Approve the first cut. Lipi builds focus, cursor motion, captions and pacing directly from the event timeline—then renders the finished file.", "render"],
  ];
  return <section className="demo-section demo-how" id="how"><div className="demo-wrap"><SectionLead number="02" eyebrow="The recording flow" title={<>A demo is not a screen<br />recording. <em>It is a point of view.</em></>} copy="Lipi starts with the details most recording tools throw away, then uses them to make the right moments obvious." />
    <div className="demo-steps">{steps.map(([n, title, body, icon]) => <article key={n}><div className="demo-step__number">{n}</div><div className="demo-step__body"><div className="demo-step__icon"><Glyph name={icon} /></div><h3>{title}</h3><p>{body}</p></div><StepVisual index={n} /></article>)}</div>
  </div></section>;
}

function StepVisual({ index }) {
  if (index === "01") return <div className="step-visual step-visual--record"><i /><span>REC</span><b>00:00:08</b><div><em /><em /><em /><em /></div></div>;
  if (index === "02") return <div className="step-visual step-visual--understand"><div><Spark /><p><b>4 steps detected</b><span>Clear tutorial structure found</span></p></div><i /><i /><i /></div>;
  return <div className="step-visual step-visual--render"><span>16:9</span><span>9:16</span><span>1:1</span><b>Rendered from one timeline</b></div>;
}

function EditStory() {
  return <section className="demo-section demo-edit" id="edits"><div className="demo-wrap demo-edit__grid"><div><SectionLead number="03" eyebrow="AI editing" title={<>The timeline is there.<br /><em>Forget it is there.</em></>} copy="Lipi gives you a useful first cut instead of another project to manage. Keep the suggestion, change the story, or make a precise adjustment when you need one." align="left" /><ul className="demo-points"><li><Glyph name="spark" /><p><b>Steps, not guesses</b><span>AI builds the narrative from visual state and recorded actions together.</span></p></li><li><Glyph name="cursor" /><p><b>Movement with a reason</b><span>The cursor renders separately, so attention moves only where it helps.</span></p></li><li><Glyph name="caption" /><p><b>Captions in the final file</b><span>ASS subtitles are rendered where they belong—not left for another tool.</span></p></li></ul></div><EditorVisual /></div></section>;
}

function EditorVisual() {
  return <div className="editor-visual" aria-label="AI edit suggestion preview"><header><span><Spark /> Lipi AI</span><small>RECORDING ANALYSED</small></header><div className="editor-visual__message"><i><Spark /></i><p><b>I found a 4-step story.</b><span>I removed the pause before the action and prepared a focused product walkthrough.</span></p></div><div className="editor-visual__choices"><p>Suggested edits</p><span><Check /> Tighten opening</span><span><Check /> Focus click target</span><span><Check /> Add captions</span><span className="is-off"><i /> Blur sensitive values</span></div><div className="editor-visual__shot"><div><b>03</b><p><strong>Invite your team</strong><small>Zoom to target · 2.4 sec</small></p><Play /></div><span>Invite team</span><i><Cursor /></i></div><footer><small>4 edits selected</small><button type="button" tabIndex={-1}>Preview first cut <Arrow /></button></footer></div>;
}

function Deliver() {
  return <section className="demo-section demo-deliver"><div className="demo-wrap demo-deliver__grid"><div><SectionLead number="04" eyebrow="Rendered for the place it lands" title={<>One recording.<br /><em>Every format.</em></>} copy="The same event-driven timeline renders the right cut for product tours, launch clips, help docs and quick replies." align="left" /><button type="button" className="demo-button" onClick={goToSignIn}>Start a recording <Arrow /></button></div><div className="demo-formats"><Format ratio="16:9" name="Product tour" /><Format ratio="9:16" name="Launch clip" tall /><Format ratio="1:1" name="Feature update" square /><Format ratio="GIF" name="Quick reply" gif /></div></div></section>;
}

function Format({ ratio, name, tall, square, gif }) { return <article className={`${tall ? "tall" : ""} ${square ? "square" : ""} ${gif ? "gif" : ""}`}><small>{name}</small><div><b>{ratio}</b><i /></div><span>{ratio === "GIF" ? "Loop" : "FFmpeg render"}</span></article>; }

function Trust() {
  return <section className="demo-section demo-trust" id="privacy"><div className="demo-wrap"><SectionLead number="05" eyebrow="Your work remains your work" title={<>Smart enough to help.<br /><em>Careful enough to trust.</em></>} copy="The recording workflow is local by default. Lipi keeps a reproducible source of truth and blurs sensitive information before an upload is prepared." /><div className="demo-trust__grid"><TrustCard glyph="lock" title="Local first" body="Capture, events and the editable timeline begin on your desktop." /><TrustCard glyph="eye" title="Private before upload" body="Sensitive information is identified and blurred before a recording leaves your machine." /><TrustCard glyph="json" title="Built to reproduce" body="The event-driven JSON timeline means each render can be recreated exactly." /></div></div></section>;
}

function TrustCard({ glyph, title, body }) { return <article><Glyph name={glyph} /><h3>{title}</h3><p>{body}</p></article>; }

function Cta({ busy }) { return <section className="demo-cta"><div className="demo-wrap"><p className="demo-kicker"><i /> Start where the work happens</p><h2>Make your product<br /><em>easy to understand.</em></h2><p>One recording is all Lipi needs to build the first story.</p><button className="demo-button" type="button" disabled={busy} onClick={goToSignIn}>Continue with Google <Arrow /></button><div className="demo-cta__shape" aria-hidden="true"><i /><span>click</span><b>record</b></div></div></section>; }
function Footer() { return <footer className="demo-footer"><div className="demo-wrap"><div className="demo-logo"><Logo size={25} color="currentColor" /><span>Demo Studio</span></div><nav aria-label="Footer"><a href="#how">Workflow</a><a href="#edits">AI editing</a><a href="#privacy">Privacy</a><a href="/privacy">Privacy policy</a><a href="/terms">Terms</a></nav><small>© {new Date().getFullYear()} Betafounder Enterprises</small></div></footer>; }

function SectionLead({ number, eyebrow, title, copy, align = "center" }) { return <header className={`demo-lead demo-lead--${align}`}><span className="demo-lead__number">/{number}</span><p className="demo-kicker"><i /> {eyebrow}</p><h2>{title}</h2><p className="demo-lead__copy">{copy}</p></header>; }
function Arrow() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>; }
function Check() { return <svg className="check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5.4 10.3 3.1 3.1 6.3-6.4" /></svg>; }
function Cursor() { return <svg viewBox="0 0 22 26" fill="none"><path d="M2 2v17l5-4 4 8 3-1.4-4-8 7-1.3L2 2Z" fill="#fff" stroke="#10110e" strokeWidth="1.5" strokeLinejoin="round" /></svg>; }
function Spark() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" /></svg>; }
function Play() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 7 5-7 5V7Z" /></svg>; }
function Glyph({ name }) { const paths = { record: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></>, spark: <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" />, render: <><path d="M5 17 19 3M7 5h12v12" /><path d="M5 9v10h10" /></>, cursor: <path d="M5 3v14l4-3 3 6 2-1-3-6 6-1L5 3Z" />, caption: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h4m3 0h3M7 14h8" /></>, lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>, eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>, json: <><path d="M9 4H7a2 2 0 0 0-2 2v3c0 1.1-.9 2-2 2 1.1 0 2 .9 2 2v3a2 2 0 0 0 2 2h2m6-14h2a2 2 0 0 1 2 2v3c0 1.1.9 2 2 2-1.1 0-2 .9-2 2v3a2 2 0 0 1-2 2h-2" /></> }; return <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
