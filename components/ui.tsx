import type { ReactNode, Ref } from "react";

export type Tone =
  | "slate"
  | "sky"
  | "amber"
  | "emerald"
  | "rose"
  | "violet"
  | "demo"
  | "linked"
  | "synthetic"
  | "connected";

/**
 * Badges carry a saturated fill so they read as deliberate status blocks rather
 * than pale tints. Text colour is whichever of white / deep ink measures higher on
 * the fill; the label and the icon always repeat the meaning, so nothing depends on
 * colour alone.
 *
 * The three status fills are written as literal arbitrary values on purpose: Tailwind
 * emits them straight from this source file, whereas newly added config tokens were
 * not being emitted by the dev pipeline. Palette of record:
 *   demo/demo-replay #F36F45 · linked evidence #1E6FE0 · synthetic data #6A35E8 · connected #007A69
 *
 * Contrast (small text, WCAG AA 4.5:1): coral+ink 5.38 · ultraviolet+white 6.39 ·
 * blue+white 4.77 · teal+white 5.27 · danger+white 4.78. Coral and ultraviolet are
 * unchanged; the blue and teal fills were darkened from #247AF2 / #008C79, which
 * measured 4.08 / 4.18 and failed AA for small text.
 */
const CHIP: Record<Tone, string> = {
  slate: "border-trast-violet/25 bg-trast-white text-trast-ink",
  sky: "border-black/10 bg-trast-blue text-white",
  amber: "border-black/10 bg-[#D97706] text-trast-ink",
  emerald: "border-black/10 bg-[#007A69] text-white",
  rose: "border-black/10 bg-[#D62F53] text-white",
  violet: "border-black/10 bg-trast-violet text-white",
  demo: "border-black/10 bg-[#F36F45] text-trast-ink",
  linked: "border-black/10 bg-trast-blue text-white",
  synthetic: "border-black/10 bg-[#6A35E8] text-white",
  connected: "border-black/10 bg-[#007A69] text-white",
};

const ACCENT: Record<Tone, string> = {
  slate: "bg-ink/20",
  sky: "bg-trast-blue",
  amber: "bg-[#D97706]",
  emerald: "bg-[#007A69]",
  rose: "bg-[#D62F53]",
  violet: "bg-trast-violet",
  demo: "bg-[#F36F45]",
  linked: "bg-trast-blue",
  synthetic: "bg-[#6A35E8]",
  connected: "bg-[#007A69]",
};

const ICON_TONE: Record<Tone, string> = {
  slate: "text-ink/70",
  sky: "text-trast-blue",
  amber: "text-[#B45309]",
  emerald: "text-[#007A69]",
  rose: "text-[#D62F53]",
  violet: "text-trast-violet",
  demo: "text-[#C2410C]",
  linked: "text-trast-blue",
  synthetic: "text-[#6A35E8]",
  connected: "text-[#007A69]",
};

export function Chip({
  tone = "slate",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 text-xs font-semibold ${CHIP[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Neutral surface for reading. Optional slim accent line carries the semantic colour. */
export function Card({
  children,
  className = "",
  accent,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  accent?: Tone;
  as?: "section" | "div" | "article" | "aside" | "header" | "nav";
}) {
  return (
    <Tag className={`relative overflow-hidden rounded-card border border-ink/10 bg-white shadow-card ${className}`}>
      {accent ? <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${ACCENT[accent]}`} /> : null}
      {children}
    </Tag>
  );
}

export function Panel({
  title,
  subtitle,
  tone = "slate",
  icon,
  badge,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card accent={tone} className={className}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon ? <span className={`mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5 ${ICON_TONE[tone]}`}>{icon}</span> : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm leading-relaxed text-ink/65">{subtitle}</p> : null}
          </div>
        </div>
        {badge ? <div className="flex flex-wrap items-center gap-2">{badge}</div> : null}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

export function Btn({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
  className = "",
  ref,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "action" | "outline" | "secondary" | "simulation" | "danger" | "quiet";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const styles = {
    primary: "border border-[#1D1054] bg-ink text-white hover:bg-[#331E8C] active:bg-[#1D1054] disabled:bg-ink/25 disabled:text-white/80",
    action:
      "border border-[#1A61C4] bg-trast-blue text-white hover:bg-[#1A61C4] active:bg-[#1655AD] disabled:border-transparent disabled:bg-trast-blue/35 disabled:text-white/85",
    outline:
      "border border-trast-violet/55 bg-white text-trast-violet hover:border-trast-violet hover:bg-trast-violet/5 disabled:opacity-45",
    secondary:
      "border border-trast-blue/45 bg-white text-trast-ink hover:border-trast-blue hover:bg-trast-blue/5 disabled:opacity-45",
    simulation:
      "border border-[#D8552F] bg-[#F36F45] text-[#24135F] hover:bg-[#E45F35] active:bg-[#D8552F] disabled:opacity-45",
    danger: "border border-danger/45 bg-white text-ink hover:bg-tint-danger disabled:opacity-45",
    quiet: "text-ink/70 underline decoration-ink/25 underline-offset-4 hover:text-ink hover:decoration-ink/60 disabled:opacity-45",
  }[variant];
  // Trast geometry: rectangles, never pills. Quiet stays a bare text action.
  const shape = variant === "quiet" ? "px-1 py-1" : "rounded-[5px] px-4 py-2";
  return (
    <button
      ref={ref}
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-[0.06em] shadow-none transition-colors disabled:cursor-not-allowed ${shape} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Trast-style modular block: 3px radius, crisp border, no dashboard chrome. */
export type MetricTone = "violet" | "ultra" | "blue" | "coral" | "pink" | "neutral";

const METRIC_BLOCK: Record<MetricTone, { filled: string; outline: string }> = {
  violet: {
    filled: "border-trast-violet bg-trast-violet",
    outline: "border-trast-violet bg-trast-white",
  },
  ultra: {
    filled: "border-trast-ultra bg-trast-ultra",
    outline: "border-trast-ultra/50 bg-trast-white",
  },
  blue: {
    filled: "border-trast-blue bg-trast-blue",
    outline: "border-trast-blue/55 bg-trast-white",
  },
  coral: {
    filled: "border-trast-coral bg-trast-coral",
    outline: "border-trast-coral/55 bg-trast-white",
  },
  pink: {
    filled: "border-trast-pink bg-trast-pink",
    outline: "border-trast-pink/55 bg-trast-white",
  },
  neutral: {
    filled: "border-trast-violet/30 bg-trast-white",
    outline: "border-trast-violet/30 bg-trast-white",
  },
};

/** Static map — Tailwind's JIT cannot see interpolated class names. */
const METRIC_ICON: Record<MetricTone, string> = {
  violet: "text-trast-violet",
  ultra: "text-trast-ultra",
  blue: "text-trast-blue",
  coral: "text-trast-coral",
  pink: "text-trast-pink",
  neutral: "text-trast-violet",
};

/** coral / pink and the two darks are the only fills whose text must be dark for contrast. */
const DARK_FILL: MetricTone[] = ["coral", "pink", "neutral"];

export function Metric({
  label,
  value,
  unit,
  tone = "neutral",
  filled = false,
  icon,
  caption,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: MetricTone;
  filled?: boolean;
  icon?: ReactNode;
  caption?: string;
}) {
  const block = filled ? METRIC_BLOCK[tone].filled : METRIC_BLOCK[tone].outline;
  const darkText = !filled || DARK_FILL.includes(tone);
  const text = darkText ? "text-trast-ink" : "text-white";
  const muted = darkText ? "text-trast-ink/75" : "text-white/85";
  const iconTone = filled ? (darkText ? "text-trast-ink" : "text-white") : METRIC_ICON[tone];

  return (
    <div className={`flex h-full min-h-[104px] flex-col justify-between rounded-[3px] border px-3.5 py-3 ${block}`}>
      <div className="flex items-start gap-2">
        {icon ? <span className={`mt-px shrink-0 [&>svg]:h-4 [&>svg]:w-4 ${iconTone}`}>{icon}</span> : null}
        <span className={`text-xs font-semibold tracking-[0.08em] ${text}`}>{label}</span>
      </div>
      <div className={`tabular mt-2 flex items-baseline gap-1.5 text-[28px] font-bold leading-none ${text}`}>
        {value}
        {unit ? <span className={`text-xs font-medium ${muted}`}>{unit}</span> : null}
      </div>
      {caption ? <div className={`mt-1 text-xs leading-snug ${muted}`}>{caption}</div> : null}
    </div>
  );
}

export function Banner({
  tone = "slate",
  title,
  children,
  glyph,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  glyph?: ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-card border px-4 py-3 ${CHIP[tone]}`}>
      {glyph ? <span className="mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{glyph}</span> : null}
      <p className="text-sm leading-relaxed">
        <span className="font-semibold">{title}</span>
        {children ? <span className="ml-1">{children}</span> : null}
      </p>
    </div>
  );
}

export function Row({ k, v, mono = false }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/[0.07] py-2 last:border-0">
      <span className="text-xs text-ink/60">{k}</span>
      <span className={`text-right text-xs text-ink ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
