// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Presenter view for the projector: the live app in an iPhone frame, plus buttons
// to jump between screens and the link judges can open on their own phones.
"use client";

import { useEffect, useState } from "react";
import IPhoneFrame from "./IPhoneFrame";

const SCREENS = [
  { label: "Home", path: "/" },
  { label: "Spin the T", path: "/spin" },
  { label: "Start an Adventure", path: "/room/new" },
  { label: "Join Room", path: "/room/demo" },
  { label: "Adventure Plan", path: "/room/demo/plan" },
  { label: "T Map", path: "/map" },
  { label: "Profile", path: "/profile" },
];

export default function DemoStage() {
  const [path, setPath] = useState("/");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#2a2140_0%,#0b0b12_60%)] text-white lg:flex-row">
      <aside className="z-10 shrink-0 px-6 pt-6 lg:flex lg:w-[380px] lg:flex-col lg:justify-center lg:px-12 lg:pt-0">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#ff9f0a]">BostonHacks · Eats &amp; Streets</p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight lg:text-[48px]">Taste of T</h1>
        <p className="mt-2 hidden text-[17px] leading-relaxed text-white/70 lg:block">
          Food quests and group adventures along the MBTA. Everyone fits the budget, everyone makes the last train.
        </p>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:mt-8 lg:flex-col lg:overflow-visible">
          {SCREENS.map((s) => (
            <button
              key={s.path}
              onClick={() => setPath(s.path)}
              className={`shrink-0 rounded-full px-4 py-2 text-left text-[15px] font-medium transition-colors lg:rounded-xl lg:py-2.5 ${
                path === s.path ? "bg-[#ff9f0a] text-black" : "bg-white/10 text-white/85 hover:bg-white/15"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {origin && (
          <div className="mt-8 hidden rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 lg:block">
            <p className="text-[13px] uppercase tracking-wider text-white/50">Try it on your phone</p>
            <p className="mt-1 break-all font-mono text-[15px] text-white">{origin}</p>
            {isLocal && <p className="mt-2 text-[13px] text-white/50">Run `npm run phone` and open /demo through that link to show a phone URL.</p>}
          </div>
        )}
      </aside>

      <div className="min-h-0 flex-1 p-4 lg:p-10">
        <IPhoneFrame src={path} title="Taste of T app" />
      </div>
    </div>
  );
}
