import type { SVGProps } from "react";

type IconName =
  | "alert"
  | "warningSign"
  | "chevron"
  | "close"
  | "history"
  | "layers"
  | "map"
  | "menu"
  | "moon"
  | "search"
  | "radio"
  | "sensor"
  | "settings"
  | "slope"
  | "sun"
  | "trend"
  | "tree";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    warningSign: (
      <>
        <path
          d="M10.3 3.7a2 2 0 0 1 3.4 0l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3l8-14Z"
          fill="#ffe36c"
          stroke="#232820"
          strokeWidth="1.9"
        />
        <path d="M12 8v6" stroke="#232820" strokeWidth="2.5" />
        <circle cx="12" cy="17" r="1.1" fill="#232820" stroke="none" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 19a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    layers: (
      <>
        <path d="m12 2 10 5-10 5L2 7l10-5Z" />
        <path d="m2 17 10 5 10-5" />
        <path d="m2 12 10 5 10-5" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" />
        <path d="M8 3v15M16 6v15" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    slope: (
      <>
        <path d="M3 21h18L3 6v15Z" />
        <path d="M7 17l4-4 4 2 5-6" />
      </>
    ),
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    sensor: (
      <>
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" />
      </>
    ),
    radio: (
      <>
        <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        <path d="M9 9a4.25 4.25 0 0 0 0 6M15 9a4.25 4.25 0 0 1 0 6" />
        <path d="M6.5 6.5a7.8 7.8 0 0 0 0 11M17.5 6.5a7.8 7.8 0 0 1 0 11" />
        <path d="M4 4a11.3 11.3 0 0 0 0 16M20 4a11.3 11.3 0 0 1 0 16" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    trend: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 3 5-7" />
      </>
    ),
    tree: (
      <>
        <path d="m12 3-5 7h3l-4 6h5v5h2v-5h5l-4-6h3l-5-7Z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        {paths[name]}
      </g>
    </svg>
  );
}
