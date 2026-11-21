// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Generic modern-iPhone mockup (Dynamic Island, status bar, home indicator) drawn in CSS.
// Hosts the real app in an iframe at true iPhone logical size (393x852) so the layout
// matches a real phone, then scales the whole device to fit the screen.
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export const SCREEN_W = 393;
export const SCREEN_H = 852;
const BEZEL = 12;
const DEVICE_W = SCREEN_W + BEZEL * 2;
const DEVICE_H = SCREEN_H + BEZEL * 2;

function useClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, ""));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/** Scale factor so the device fits inside its container. */
function useFitScale(ref: RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, width / DEVICE_W, height / DEVICE_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

function StatusIcons() {
  return (
    <span className="flex items-center gap-[5px]">
      {/* cellular */}
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      {/* wifi */}
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
        <path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .8C5.3.8 2.7 1.8.8 3.7L2 5C3.6 3.5 5.7 2.6 8 2.6Z" />
        <path d="M8 6.1c1.3 0 2.5.5 3.5 1.3l1.2-1.3A6.8 6.8 0 0 0 8 4.3c-1.8 0-3.4.6-4.7 1.8l1.2 1.3c1-.8 2.2-1.3 3.5-1.3Z" />
        <path d="m8 11.4 2.3-2.5A3.3 3.3 0 0 0 8 8c-.9 0-1.7.3-2.3.9L8 11.4Z" />
      </svg>
      {/* battery */}
      <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4" />
        <rect x="2" y="2" width="17" height="9" rx="2.5" fill="currentColor" />
        <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".45" />
      </svg>
    </span>
  );
}

export default function IPhoneFrame({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(boxRef);
  const time = useClock();

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center">
      <div style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }}>
        <div
          className="relative origin-top-left rounded-[67px] bg-[#1c1c1e] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6),inset_0_0_0_2px_#3a3a3c,inset_0_0_0_5px_#0a0a0a]"
          style={{ width: DEVICE_W, height: DEVICE_H, padding: BEZEL, transform: `scale(${scale})` }}
        >
          {/* side buttons */}
          <span className="absolute -left-[3px] top-[120px] h-8 w-[3px] rounded-l bg-[#2c2c2e]" />
          <span className="absolute -left-[3px] top-[180px] h-16 w-[3px] rounded-l bg-[#2c2c2e]" />
          <span className="absolute -left-[3px] top-[256px] h-16 w-[3px] rounded-l bg-[#2c2c2e]" />
          <span className="absolute -right-[3px] top-[210px] h-24 w-[3px] rounded-r bg-[#2c2c2e]" />

          {/* screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[55px] bg-grouped">
            <iframe key={src} src={src} title={title} className="block h-full w-full border-0" style={{ width: SCREEN_W, height: SCREEN_H }} />

            {/* status bar (drawn over the app; the app reserves 54px for it via html.in-frame) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[54px] items-center justify-between px-[34px] pt-1 text-label">
              <span className="w-[54px] text-center text-[17px] font-semibold tracking-tight">{time}</span>
              <StatusIcons />
            </div>
            {/* Dynamic Island */}
            <div className="pointer-events-none absolute left-1/2 top-[11px] h-[37px] w-[125px] -translate-x-1/2 rounded-full bg-black" />
            {/* home indicator */}
            <div className="pointer-events-none absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-label" />
          </div>
        </div>
      </div>
    </div>
  );
}
