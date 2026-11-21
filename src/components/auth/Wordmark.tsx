// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// "taste of (T)" wordmark from the Figma design: DM Serif Display text plus a bold,
// MBTA-style outlined T. Fonts come from src/app/login/page.tsx (--font-dm-serif / --font-dm-sans).

const sizes = {
  // Splash/loading screen
  lg: { text: "text-[48px] gap-[7px] tracking-[-0.03em]", ring: "h-[45px] w-[45px] text-[30px] border-[3.5px]" },
  // Welcome screen
  md: { text: "text-[32px] gap-1.5", ring: "h-[39px] w-[39px] text-[24px] border-[3.5px]" },
  // Login / create-account header
  sm: { text: "text-[22px] gap-1.5", ring: "h-[28px] w-[28px] text-[16px] border-[2.5px]" },
} as const;

export default function Wordmark({ size = "sm", as: Tag = "div" }: { size?: keyof typeof sizes; as?: "div" | "h1" }) {
  const s = sizes[size];
  return (
    <Tag className={`flex items-center justify-center font-normal leading-none text-[#30203F] [font-family:var(--font-dm-serif),Georgia,serif] ${s.text}`}>
      taste of
      <span
        className={`inline-grid place-items-center rounded-full border-[#30203F] font-extrabold leading-none [font-family:var(--font-dm-sans),sans-serif] ${s.ring}`}
      >
        T
      </span>
    </Tag>
  );
}
