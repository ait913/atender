import type { CSSProperties, ReactNode } from "react";

export type EventTileDensity = "compact" | "comfortable";

export type EventTileProps = {
  title: string;
  color: string;
  subtitle?: string | null;
  meta?: string | null;
  density?: EventTileDensity;
  align?: "center" | "top";
  showPill?: boolean;
  onClick?: () => void;
  leadingIcon?: ReactNode;
  badge?: ReactNode;
  height?: string | number;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  radius?: string;
};

export function EventTile({
  title,
  color,
  subtitle,
  meta,
  density = "compact",
  align = "center",
  showPill = true,
  onClick,
  leadingIcon,
  badge,
  height,
  ariaLabel,
  className = "",
  style,
  radius,
}: EventTileProps) {
  const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
  const tint = `color-mix(in srgb, ${color} 15%, var(--color-bg-elevated))`;
  const pad = density === "compact" ? "px-2 py-1" : "px-2.5 py-1.5";
  const pillInset = density === "compact" ? "left-1 top-1 bottom-1" : "left-1.5 top-1.5 bottom-1.5";
  const pillWidth = density === "compact" ? "w-0.5" : "w-1";
  const titleSize = density === "compact" ? "text-[12px]" : "text-[13px]";
  const subtitleSize = density === "compact" ? "text-[10px]" : "text-[11px]";
  const rootClass = `relative block w-full overflow-hidden text-left transition active:scale-[0.99] ${radius ? "" : "rounded-md"} ${className}`;
  const rootStyle = { background: tint, height, borderRadius: radius, ...style };
  const content = (
    <>
      {showPill ? (
        <span
          className={`absolute ${pillInset} ${pillWidth} rounded-full`}
          style={{ background: color }}
        />
      ) : null}
      <div className={`flex h-full gap-2 ${align === "top" ? "items-start" : "items-center"} ${pad} ${showPill ? "pl-3" : ""}`}>
        {badge ?? null}
        <div className="min-w-0 flex-1">
          <p className={`line-clamp-2 ${titleSize} font-semibold leading-tight text-fg-primary`}>
            {leadingIcon ? <span className="mr-1 inline-flex align-middle">{leadingIcon}</span> : null}
            {title}
          </p>
          {subtitle ? (
            <p className={`mt-0.5 truncate ${subtitleSize} font-medium`} style={{ color: subColor }}>
              {subtitle}
            </p>
          ) : null}
          {meta ? (
            <p className={`truncate ${subtitleSize} leading-tight text-fg-tertiary`}>{meta}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`${rootClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500`}
        style={rootStyle}
      >
        {content}
      </button>
    );
  }

  return (
    <div aria-label={ariaLabel} className={rootClass} style={rootStyle}>
      {content}
    </div>
  );
}
