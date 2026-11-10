import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  label: ReactNode
  pct: number | null
  foot: ReactNode
  empty?: ReactNode
  tone?: "blue" | "cyan" | "teal" | "auto"
}

/**
 * Vibe style metric progress bar:
 * - Clean label + tabular percentage on top
 * - Smooth rounded track with semantic or Vibe Blue/Cyan fill
 * - Sub-caption underneath
 */
export function Meter({ label, pct, foot, empty = "—", tone = "auto" }: Props) {
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  const barColor =
    pct !== null && pct >= 90
      ? "bg-rose-500"
      : pct !== null && pct >= 80
        ? "bg-amber-500"
        : tone === "cyan"
          ? "bg-[var(--vibe-cyan)]"
          : tone === "teal"
            ? "bg-[var(--vibe-teal)]"
            : "bg-[var(--vibe-blue)]"

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "tnum text-xs font-semibold",
            pct !== null && pct >= 90
              ? "text-rose-500"
              : pct !== null && pct >= 80
                ? "text-amber-500"
                : "text-foreground",
          )}
        >
          {pct === null ? empty : `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", barColor)}
          style={{ width: `${filled}%` }}
        />
      </div>
      <div className="tnum mt-1.5 truncate text-[11px] text-muted-foreground">{foot}</div>
    </div>
  )
}
