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
  // Home mini-header (Figma "brand-with-t")
  xs: { text: "text-[19px] gap-1", ring: "h-[24px] w-[24px] text-[14px] border-[2.5px]" },
} as const;

export default function Wordmark({
  size = "sm",
  as: Tag = "div",
  tone = "ink",
}: {
  size?: keyof typeof sizes;
  as?: "div" | "h1";
  /** "ink" = Figma plum (light-only screens); "current" = inherit, for themed screens with dark mode. */
  tone?: "ink" | "current";
}) {
  const s = sizes[size];
  const color = tone === "ink" ? "text-[#30203F]" : "text-current";
  const ringColor = tone === "ink" ? "border-[#30203F]" : "border-current";
  return (
    <Tag className={`flex items-center justify-center font-normal leading-none ${color} [font-family:var(--font-dm-serif),Georgia,serif] ${s.text}`}>
      taste of
      <span
        className={`inline-grid place-items-center rounded-full ${ringColor} font-extrabold leading-none [font-family:var(--font-dm-sans),sans-serif] ${s.ring}`}
      >
        T
      </span>
    </Tag>
  );
}
