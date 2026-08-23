import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function LogoIcon(props: IconProps) {
  return (
    <svg {...base({ ...props, stroke: props.stroke ?? "#ffffff", strokeWidth: 2.2 })}>
      <path d="M8 6 3 12l5 6" />
      <path d="m16 6 5 6-5 6" />
    </svg>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 20h1M17 21h-3" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11.5 4.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07L12.5 19.5" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 3v5h5" />
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M9 14h6M9 17h4" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v3M12 18v3M4.9 7l2.6 1.5M16.5 15.5 19.1 17M4.9 17l2.6-1.5M16.5 8.5 19.1 7" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function WebhookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v6l-3 5" />
      <circle cx="12" cy="4" r="1.8" />
      <circle cx="6" cy="17" r="1.8" />
      <circle cx="18" cy="17" r="1.8" />
      <path d="M8 17h8" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 9h8M8 13h5" />
      <path d="M5 4h14v12l-5 4v-4H5z" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 3, ...props })}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2, ...props })}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 1.6, ...props })}>
      <path d="M12 9v5M12 17.5v.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 1.6, ...props })}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a1 1 0 0 0-1 1v9" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 1.6, ...props })}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
