// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Simple original glyphs in the spirit of SF Symbols (Apple's symbols can't be
// shipped on the web). All take currentColor and a size.

type P = { size?: number; className?: string };
const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  className,
  "aria-hidden": true,
});

export const HomeIcon = ({ size = 24, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6.5H9V21H4.5a1 1 0 0 1-1-1v-9.5Z" fill="currentColor" />
  </svg>
);

export const DiceIcon = ({ size = 24, className }: P) => (
  <svg {...svg(size, className)}>
    {/* Pips are cut out (evenodd) so the die reads on any background. */}
    <path
      fill="currentColor"
      fillRule="evenodd"
      d={[
        "M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5Z",
        ...[[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].map(
          ([x, y]) => `M${x - 1.6} ${y}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0Z`,
        ),
      ].join("")}
    />
  </svg>
);

export const MapIcon = ({ size = 24, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" fill="currentColor" opacity=".35" />
    <path d="M9 4v14l6 2V6L9 4Z" fill="currentColor" />
  </svg>
);

export const PersonIcon = ({ size = 24, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".35" />
    <circle cx="12" cy="9.5" r="3.5" fill="currentColor" />
    <path d="M5.8 18.2C7.2 15.9 9.4 14.8 12 14.8s4.8 1.1 6.2 3.4A9.4 9.4 0 0 1 12 21.5a9.4 9.4 0 0 1-6.2-3.3Z" fill="currentColor" />
  </svg>
);

export const GroupIcon = ({ size = 24, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="9" cy="8.5" r="3.5" fill="currentColor" />
    <circle cx="16.5" cy="9.5" r="2.8" fill="currentColor" opacity=".6" />
    <path d="M2.5 19c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5H2.5Z" fill="currentColor" />
    <path d="M15.6 14c2.9-.2 5.3 1.6 5.9 4.5h-4.4c-.2-1.7-.7-3.2-1.5-4.5Z" fill="currentColor" opacity=".6" />
  </svg>
);

export const ChevronRight = ({ size = 14, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronLeft = ({ size = 22, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="m15 4-8 8 8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ForkKnifeIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M7 3v7M5 3v5a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2 1.5-3 4-3 7v3h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ClockIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
    <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const DollarIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M12 3v18M16 7.5c-.8-1.2-2.3-2-4-2-2.2 0-4 1.2-4 3s1.6 2.6 4 3.2 4 1.4 4 3.3-1.8 3-4 3c-1.8 0-3.4-.8-4.2-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const TrainIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <rect x="5" y="3" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="2" />
    <path d="M5 10.5h14M8.5 21l1.5-4M15.5 21 14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="9" cy="14" r="1" fill="currentColor" />
    <circle cx="15" cy="14" r="1" fill="currentColor" />
  </svg>
);

export const StarIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill="currentColor" />
  </svg>
);

export const MoonIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor" />
  </svg>
);

export const HeartIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" fill="currentColor" />
  </svg>
);

export const CheckIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShareIcon =({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M12 15V3.5M8 7l4-4 4 4M7 10.5H5.5v10h13v-10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Rewards and achievements (same line style: 2px stroke, round caps, currentColor).

export const CoffeeIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CakeIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M4.5 20.5h15V13a2.5 2.5 0 0 0-2.5-2.5H7A2.5 2.5 0 0 0 4.5 13v7.5ZM4.5 15c1.3 1 2.5 1 3.75 0s2.5-1 3.75 0 2.5 1 3.75 0 2.5-1 3.75 0M12 10.5V7M12 3.5c.9 1 .9 2 0 3-.9-1-.9-2 0-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TagIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.8 7.8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-7.9-7.8a1 1 0 0 1-.3-.6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="1.6" fill="currentColor" />
  </svg>
);

export const BikeIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="5.5" cy="16" r="3.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="18.5" cy="16" r="3.5" stroke="currentColor" strokeWidth="2" />
    <path d="M5.5 16 9 8.5h7M18.5 16 15 6.5h2.5M9 8.5l3.5 7.5L16 8.5M7.5 6.5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BusIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <rect x="4.5" y="3" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
    <path d="M4.5 11h15M4.5 7h15M7.5 18v2.5M16.5 18v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="8.5" cy="14.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="14.5" r="1" fill="currentColor" />
  </svg>
);

export const SwapIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5M20 16H6M9.5 12.5 6 16l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RouteIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 18h6.5a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CompassIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const TrophyIcon = ({ size = 18, className }: P) => (
  <svg {...svg(size, className)}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
