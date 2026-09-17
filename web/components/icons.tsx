/**
 * Inline operational motifs — pallet, package, delivery, inspection, evidence and
 * status glyphs. Hand-drawn SVGs, no stock photography, no external assets.
 * All are decorative: `aria-hidden` unless a title is supplied.
 */

type IconProps = { className?: string; title?: string };

function Svg({ className = "h-5 w-5", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconPallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
    <path d="M3 14l9 4.5 9-4.5" />
    <path d="M3 8.5V14m18-5.5V14" />
  </Svg>
);

export const IconPackage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 8.2v7.6a1.6 1.6 0 0 1-.85 1.41l-6.4 3.3a1.6 1.6 0 0 1-1.5 0l-6.4-3.3A1.6 1.6 0 0 1 4 15.8V8.2" />
    <path d="M4.6 7.6 12 11.4l7.4-3.8L12 3.8 4.6 7.6Z" />
    <path d="M12 11.4V20" />
  </Svg>
);

export const IconTruck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 7.5h10.5v9H2z" />
    <path d="M12.5 10.5H17l3 3v3h-7.5z" />
    <circle cx="6.5" cy="18" r="1.8" />
    <circle cx="16.5" cy="18" r="1.8" />
  </Svg>
);

export const IconClipboard = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4.5h6v2.2H9z" />
    <path d="M15 5.6h2.2A1.3 1.3 0 0 1 18.5 7v11.6a1.3 1.3 0 0 1-1.3 1.3H6.8a1.3 1.3 0 0 1-1.3-1.3V7a1.3 1.3 0 0 1 1.3-1.4H9" />
    <path d="M8.6 11.6h6.8M8.6 15.2h4.2" />
  </Svg>
);

export const IconInvoice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.6h12v16.8l-3-1.6-3 1.6-3-1.6-3 1.6z" />
    <path d="M9 8.4h6M9 12.2h6" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 3.5 8l8.5 4.5L20.5 8 12 3.5Z" />
    <path d="M3.5 12.5 12 17l8.5-4.5" />
    <path d="M3.5 16.5 12 21l8.5-4.5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M8.4 12.3l2.5 2.5 4.7-5" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.2 21 19.4H3z" />
    <path d="M12 9.6v4.1M12 16.5h.01" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.2M12 7.9h.01" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.4" r="3.4" />
    <path d="M5.5 19.4a6.6 6.6 0 0 1 13 0" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h14" />
    <path d="M13 6.5 18.5 12 13 17.5" />
  </Svg>
);
