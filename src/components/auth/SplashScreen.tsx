// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Loading screen: wordmark, the animated skyline + MBTA train from the Figma design, and a
// progress bar. It stays only while the welcome screen's fonts and illustration actually
// load (no minimum display time), then fades out and calls onDone.
"use client";

import { useEffect, useState } from "react";
import "./auth-intro.css";
import Wordmark from "./Wordmark";

export const WELCOME_ILLUSTRATION = "/auth/welcome-illustration.png";
const MAX_WAIT_MS = 4000; // upper bound only: never hold a signed-out visitor on a stalled font/image
const FADE_MS = 350;

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  // Step 1 (the page itself) is done once this has hydrated; then fonts and the illustration.
  const total = 3;
  const [done, setDone] = useState(1);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = () => !cancelled && setDone((n) => n + 1);
    const tasks = [document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve(), preloadImage(WELCOME_ILLUSTRATION)].map((p) =>
      p.then(tick, tick),
    );
    const cap = new Promise<void>((r) => setTimeout(r, MAX_WAIT_MS));
    Promise.race([Promise.all(tasks), cap]).then(() => {
      if (cancelled) return;
      setDone(total);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return onDone();
      setLeaving(true);
      setTimeout(() => !cancelled && onDone(), FADE_MS);
    });
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  const pct = Math.round((done / total) * 100);

  return (
    <main
      className={`flex min-h-dvh items-center justify-center bg-[#F3EDFF] px-5 transition-opacity duration-[350ms] ease-out motion-reduce:transition-none ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ paddingTop: "max(24px, var(--safe-top))", paddingBottom: "max(24px, var(--safe-bottom))" }}
      aria-busy={!leaving}
    >
      <div className="w-full text-center">
        <Wordmark size="lg" as="h1" />
        <AnimatedLoadingScene />
        <div
          role="progressbar"
          aria-label="Loading Taste of T"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mx-auto h-2 w-[260px] overflow-hidden rounded-full bg-[#DED2F3]"
        >
          <i className="block h-full rounded-full bg-[#7954AC] transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </main>
  );
}

/** The Figma Make "AnimatedLoadingScene" SVG, unchanged. Styles live in intro.module.css. */
function AnimatedLoadingScene() {
  return (
    <div className="tot-scene">
      <svg viewBox="0 0 360 225" role="img" aria-label="Animated MBTA train passing the Boston skyline">
        <defs>
          <clipPath id="loading-scene-clip">
            <rect width="360" height="225" />
          </clipPath>
        </defs>
        <g className="loading-skyline">
          <rect x="41" y="86" width="31" height="67" rx="1" />
          <path d="M80 153V76h39v77M80 76l19-17 20 17" />
          <rect x="128" y="54" width="39" height="99" rx="1" />
          <path d="M148 54V28M143 28h10" />
          <rect x="177" y="91" width="34" height="62" rx="1" />
          <path d="M221 153V72h41v81M221 72l20-18 21 18" />
          <rect x="271" y="98" width="30" height="55" rx="1" />
          <path
            className="loading-windows"
            d="M49 99h15M49 111h15M89 91h21M89 103h21M137 71h21M137 84h21M137 97h21M186 106h16M230 88h23M230 100h23M279 112h14"
          />
          <path className="loading-bush" d="M17 154v-13M8 143c-5-10 8-16 13-8 5-9 18-1 13 8M306 154v-12M298 143c-5-10 8-16 13-8 5-9 18-1 13 8" />
          <path className="sign-pole" d="M334 78v76" />
          <circle cx="334" cy="61" r="17" />
          <text x="334" y="67" textAnchor="middle">
            T
          </text>
        </g>
        <g className="loading-tracks">
          <path d="M-12 181h388M-12 194h388" />
          <path
            className="track-ties"
            d="M15 179l4 17M49 179l4 17M83 179l4 17M117 179l4 17M151 179l4 17M185 179l4 17M219 179l4 17M253 179l4 17M287 179l4 17M321 179l4 17M355 179l4 17"
          />
        </g>
        <g clipPath="url(#loading-scene-clip)">
          <g className="moving-train">
            <g className="motion-lines">
              <path d="M-28 126h18M-37 136h27M-24 146h14" />
            </g>
            {[0, 87, 174, 261].map((x) => (
              <g transform={`translate(${x} 0)`} key={`car-${x}`}>
                <path className="train-body" d="M0 102Q4 94 15 92h67v75H0Z" />
                <path className="train-stripe" d="M0 141h82v24H0Z" />
                <path className="train-window" d="M8 106h23v29H8ZM52 106h22v29H52Z" />
                <path className="train-door" d="M34 104h15v57H34ZM41.5 109v27" />
                <path className="train-detail" d="M7 99h69M8 146h66M10 158h62" />
                <path className="train-coupler" d="M82 151h5" />
              </g>
            ))}
            <g transform="translate(348 0)">
              <path className="train-body" d="M0 102Q4 94 15 92h67q22 1 30 20l2 9v46H0Z" />
              <path className="train-stripe" d="M0 141h113v24H0Z" />
              <path className="train-window" d="M10 106h25v29H10ZM43 106h25v29H43ZM76 106h8q14 2 18 22v7H76Z" />
              <path className="train-door" d="M70 104h2v57h-2" />
              <path className="train-detail" d="M7 99h69M8 146h95M10 158h91M76 104v34" />
              <rect className="route-display" x="65" y="96" width="27" height="7" rx="3.5" />
              <circle className="train-light" cx="105" cy="145" r="3" />
              <circle className="train-t-symbol" cx="88" cy="153" r="9" />
              <text className="train-t-letter" x="88" y="157" textAnchor="middle">
                T
              </text>
            </g>
            {[22, 62, 109, 149, 196, 236, 283, 323, 372, 420].map((x) => (
              <g transform={`translate(${x} 169)`} key={x}>
                <g className="train-wheel">
                  <circle r="9" />
                  <path d="M-6 0H6M0-6V6M-4-4 4 4M4-4-4 4" />
                </g>
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
