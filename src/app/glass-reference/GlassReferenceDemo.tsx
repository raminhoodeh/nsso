"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Sparkles } from "lucide-react";

import {
  LiquidGlassButton,
  LiquidGlassViewport,
} from "@/components/ui/apple-tahoe-liquid-glass-button";

const ZapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const GRID_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
    <defs>
      <pattern id="checker" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#ffffff"/>
        <rect x="20" y="20" width="20" height="20" fill="#ffffff"/>
        <rect x="20" width="20" height="20" fill="#050505"/>
        <rect y="20" width="20" height="20" fill="#050505"/>
      </pattern>
      <pattern id="major" width="200" height="200" patternUnits="userSpaceOnUse">
        <rect width="200" height="200" fill="url(#checker)"/>
        <path d="M0 0H200V200" fill="none" stroke="#00e5ff" stroke-width="6"/>
        <path d="M0 200L200 0" fill="none" stroke="#ff2bd6" stroke-width="4"/>
      </pattern>
    </defs>
    <rect width="1600" height="1000" fill="url(#major)"/>
    <path d="M0 500H1600M800 0V1000" stroke="#ffef00" stroke-width="10"/>
    <circle cx="800" cy="500" r="180" fill="none" stroke="#ff3131" stroke-width="12"/>
    <circle cx="800" cy="500" r="260" fill="none" stroke="#28ff52" stroke-width="8"/>
  </svg>
`;

const GRID_BACKGROUND = `data:image/svg+xml,${encodeURIComponent(GRID_SVG)}`;

const BACKGROUND_IMAGES = [
  "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/f0733c36-a64b-4f7c-b06c-3c679f8ddbc1_3840w.webp",
  "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/ac5ddc71-c7e9-4c7d-8cf1-f31081856db9_3840w.webp",
  "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1920&q=80",
] as const;

const SPRING_CONFIG = { damping: 25, stiffness: 150, mass: 0.5 };

export default function GlassReferenceDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonWrapperRef = useRef<HTMLDivElement>(null);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [isGridMode, setIsGridMode] = useState(false);

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const smoothX = useSpring(cursorX, SPRING_CONFIG);
  const smoothY = useSpring(cursorY, SPRING_CONFIG);

  useEffect(() => {
    const centerButton = () => {
      if (!containerRef.current || !buttonWrapperRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const buttonRect = buttonWrapperRef.current.getBoundingClientRect();
      cursorX.set(containerRect.width / 2 - buttonRect.width / 2);
      cursorY.set(containerRect.height / 2 - buttonRect.height / 2);
    };

    centerButton();

    const handleMouseMove = (event: MouseEvent) => {
      if (isGridMode || !buttonWrapperRef.current || !containerRef.current) return;

      const buttonRect = buttonWrapperRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      cursorX.set(event.clientX - containerRect.left - buttonRect.width / 2);
      cursorY.set(event.clientY - containerRect.top - buttonRect.height / 2);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", centerButton);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", centerButton);
    };
  }, [cursorX, cursorY, isGridMode]);

  const handleBackgroundChange = () => {
    setIsGridMode(false);
    setBackgroundIndex((previous) => (previous + 1) % BACKGROUND_IMAGES.length);
  };

  const backgroundImage = isGridMode ? GRID_BACKGROUND : BACKGROUND_IMAGES[backgroundIndex];

  return (
    <main
      ref={containerRef}
      className="fixed inset-0 z-[10000] flex h-[100dvh] w-screen overflow-hidden bg-black select-none"
      data-glass-reference-mode={isGridMode ? "grid" : "scene"}
    >
      <LiquidGlassViewport
        key={`${isGridMode ? "grid" : "scene"}-${backgroundIndex}`}
        bgImage={backgroundImage}
        fallbackMode="webgl"
        className="h-full w-full rounded-none border-none"
      >
        <motion.div
          ref={buttonWrapperRef}
          className="pointer-events-auto absolute left-0 top-0 z-10"
          style={{ x: smoothX, y: smoothY }}
        >
          <LiquidGlassButton data-testid="tahoe-reference-button">
            <span>Generate</span>
            <ZapIcon className="h-5 w-5 fill-black/10 text-black/85" />
          </LiquidGlassButton>
        </motion.div>
      </LiquidGlassViewport>

      <div className="fixed bottom-8 right-8 z-[10001] flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsGridMode((current) => !current)}
          className="flex cursor-pointer items-center gap-2.5 rounded-full border border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold text-white shadow-2xl shadow-black/60 backdrop-blur-md transition-all hover:scale-105 hover:border-white/20 hover:bg-black/80 active:scale-95"
          aria-pressed={isGridMode}
          title="Toggle deterministic high-contrast refraction grid"
        >
          <span aria-hidden="true" className="h-3.5 w-3.5 border border-cyan-300 bg-[linear-gradient(45deg,#fff_25%,#000_25%,#000_50%,#fff_50%,#fff_75%,#000_75%)] bg-[length:6px_6px]" />
          <span>{isGridMode ? "Use Scene" : "Grid Test"}</span>
        </button>

        <button
          type="button"
          onClick={handleBackgroundChange}
          className="flex cursor-pointer items-center gap-2.5 rounded-full border border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold text-white shadow-2xl shadow-black/60 backdrop-blur-md transition-all hover:scale-105 hover:border-white/20 hover:bg-black/80 active:scale-95"
          title="Cycle backdrop image"
        >
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span>Change Scene</span>
        </button>
      </div>

      <output className="fixed left-5 top-5 z-[10001] rounded-full border border-white/20 bg-black/70 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
        {isGridMode ? "Deterministic grid · centered lens" : `Reference scene ${backgroundIndex + 1} · cursor lens`}
      </output>
    </main>
  );
}
