"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import {
  LiquidGlass,
  LiquidGlassButton,
  type GlassEngine,
  detectEngine,
} from "@/components/ui/experimental/liquid-glass-candidate";
import styles from "./glass-candidate.module.css";

const subscribeEngine = () => () => {};
const serverEngine = (): GlassEngine | null => null;

export default function GlassCandidateDemo() {
  const engine = useSyncExternalStore(subscribeEngine, detectEngine, serverEngine);
  const [frost, setFrost] = useState(false);
  const [grid, setGrid] = useState(true);
  const [moving, setMoving] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [amount, setAmount] = useState(32);
  const [pressed, setPressed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mode = frost ? "frost" : "auto";
  const actual = !engine ? "Checking browser…" : frost || engine !== "chromium"
    ? "Frosted blur — no refraction" : "SVG refraction requested — inspect the grid";

  return (
    <div className={styles.demo} data-testid="glass-candidate-demo" data-engine={engine ?? "pending"}>
      {grid && <div aria-hidden className={`${styles.grid} ${moving ? styles.moving : ""}`} />}
      <div ref={scrollRef} className={styles.scroller} data-testid="candidate-scroll">
        <main className={styles.content}>
          <p className={styles.eyebrow}>Local evaluation · not live NSSO</p>
          <h1>Try the supplied glass.</h1>
          <p>Scroll the text behind the top bar. Look for bent grid lines at the edge, not just blur or a painted highlight.</p>
          <section className={styles.controls} aria-label="Comparison controls">
            <p role="status" data-testid="candidate-status">{actual}</p>
            <label><input type="checkbox" checked={frost} onChange={(e) => setFrost(e.target.checked)} /> Blur-only comparison</label>
            <label><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> High-contrast grid (off shows NSSO clouds)</label>
            <label><input type="checkbox" checked={moving} onChange={(e) => setMoving(e.target.checked)} /> Animate grid</label>
            <label>Rim pull: <output>{amount}px</output><input aria-label="Rim pull" type="range" min="0" max="60" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
            <button type="button" onClick={() => setMounted((value) => !value)}>{mounted ? "Hide" : "Show"} glass surfaces</button>
            <p className={styles.note}>Safari and WebKit-based iPhone browsers intentionally receive blur in this component. This is a web simulation, not Apple’s native renderer.</p>
          </section>
          {mounted && <LiquidGlass
            data-testid="candidate-card" material="clear" appearance="dark"
            refraction={amount} bezel={32} blur={1} mode={mode} motion="none" fluid={false}
            className={styles.card}
          >
            <h2>Card on the same backdrop</h2>
            <p>The rim should bend the grid. A moving canvas is not automatically incompatible: browser support and the compositing boundary matter.</p>
            <LiquidGlassButton size="sm" appearance="dark" mode={mode} interactive motion="reduced" onClick={() => setPressed((n) => n + 1)}>
              <Sparkles size={16} aria-hidden /> Test button
            </LiquidGlassButton>
            <span className={styles.clickCount} role="status">Pressed {pressed} times</span>
          </LiquidGlass>}
          <section className={styles.scrollContent} aria-label="Content behind glass">
            {Array.from({ length: 10 }, (_, i) => <article key={i}>
              <p className={styles.eyebrow}>Scroll target {String(i + 1).padStart(2, "0")}</p>
              <h2>All of you.<br />All in one place.</h2>
              <p>These are real page elements passing underneath the fixed navigation, not a duplicated screenshot inside the glass.</p>
            </article>)}
          </section>
        </main>
      </div>
      {mounted && <LiquidGlass
        data-testid="candidate-nav" material="clear" appearance="dark"
        refraction={amount} bezel={28} blur={1} mode={mode} motion="none" fluid={false}
        className={styles.nav}
      >
        <span className={styles.logo}>nsso</span>
        <span className={styles.navLabel}>Supplied component</span>
        <LiquidGlassButton appearance="dark" size="sm" mode={mode} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top
        </LiquidGlassButton>
      </LiquidGlass>}
    </div>
  );
}
