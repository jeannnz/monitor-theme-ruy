import { ArrowUpRight, CalendarClock, Coins, Gauge, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Country, Expiry } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import {
  bytes,
  cycle,
  cycleMonths,
  expiresIn,
  FOREVER,
  money,
  monthUsage,
  pair,
  percent,
  trafficModeLabel,
} from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Vibe "Revenue & Spend / Quota Funnel" inspired view:
 * Comprehensively visualizes server billing cycles, monthly cost equivalents per currency,
 * traffic quota consumption ranking, and renewal schedules.
 */
export function BillingView({
  nodes,
  onSelectNode,
}: {
  nodes: Node[]
  onSelectNode: (id: number) => void
}) {
  const { lang, tr } = useI18n()
  // 1. Group recurring monthly cost by currency
  const byCurrency = new Map<string, { currency: string; monthlyEq: number; totalContract: number; count: number }>()
  for (const n of nodes) {
    if (n.price <= 0) continue
    const cur = (n.currency || "CNY").toUpperCase()
    const item = byCurrency.get(cur) ?? { currency: cur, monthlyEq: 0, totalContract: 0, count: 0 }
    item.count++
    item.totalContract += n.price
    const m = cycleMonths(n.billing_cycle)
    if (m > 0) item.monthlyEq += n.price / m
    byCurrency.set(cur, item)
  }
  const currencyList = [...byCurrency.values()]

  // 2. Expiring & Renewal Timeline sorted by expires_in ascending
  const withExpiry = [...nodes]
    .filter((n) => expiresIn(n) !== null)
    .sort((a, b) => (expiresIn(a) ?? 99999) - (expiresIn(b) ?? 99999))

  // 3. Traffic Quota Leaderboard
  const byTraffic = [...nodes].sort((a, b) => monthUsage(b) - monthUsage(a))

  return (
    <div className="space-y-4">
      {/* Top Row: Currency Spend Cards + Renewal Summary */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="justify-between p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("计费节点占比", "Paid Nodes")}</span>
            <Coins className="size-4 text-[var(--vibe-blue)]" />
          </div>
          <div className="tnum text-2xl font-bold">
            {nodes.filter((n) => n.price > 0).length}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {nodes.length} {tr("台", "")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="blue">
              {tr(`${currencyList.length || 0} 币种`, `${currencyList.length || 0} Currencies`)}
            </Badge>
            <span>
              {tr(
                `${nodes.filter((n) => n.price === 0).length} 免费/自建`,
                `${nodes.filter((n) => n.price === 0).length} Free / Self-hosted`,
              )}
            </span>
          </div>
        </Card>

        {currencyList.slice(0, 2).map((c) => (
          <Card key={c.currency} className="justify-between p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium">
                {tr(`${c.currency} 月均成本`, `${c.currency} Monthly Cost`)}
              </span>
              <TrendingUp className="size-4 text-[var(--vibe-cyan)]" />
            </div>
            <div className="tnum text-2xl font-bold">
              {money(c.monthlyEq, c.currency)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{tr("/ 月", "/ mo")}</span>
            </div>
            <div className="tnum flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {tr("合同总额", "Contract Total")} {money(c.totalContract, c.currency)}
              </span>
              <Badge variant="outline">
                {c.count} {tr("节点", "Nodes")}
              </Badge>
            </div>
          </Card>
        ))}

        <Card className="justify-between p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("近期续费", "Upcoming Renewals")}</span>
            <CalendarClock className="size-4 text-[var(--vibe-teal)]" />
          </div>
          <div className="tnum text-2xl font-bold">
            {withExpiry.filter((n) => (expiresIn(n) ?? 999) <= 14).length}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {tr("台 (14天内)", "nodes (14d)")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant={withExpiry.some((n) => (expiresIn(n) ?? 1) < 0) ? "rose" : "emerald"}
            >
              {tr(
                `${withExpiry.filter((n) => (expiresIn(n) ?? 1) < 0).length} 已过期`,
                `${withExpiry.filter((n) => (expiresIn(n) ?? 1) < 0).length} Expired`,
              )}
            </Badge>
            <span>
              {tr(
                `${nodes.filter((n) => expiresIn(n) === null).length} 长期`,
                `${nodes.filter((n) => expiresIn(n) === null).length} Permanent`,
              )}
            </span>
          </div>
        </Card>
      </div>

      {/* Main Split: Traffic Quota Consumption vs Renewal Schedule */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Monthly Traffic Quota Utilization (7 cols) */}
        <Card className="p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-[var(--vibe-blue)]" />
              <h3 className="text-sm font-semibold">
                {tr("月度流量配额排行", "Monthly Quota Utilization")}
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {tr("按节点计费规则统计", "Calculated by node traffic mode")}
            </span>
          </div>

          <div className="mt-2 space-y-3">
            {byTraffic.slice(0, 12).map((n) => {
              const used = monthUsage(n)
              const pct = n.traffic_limit > 0 ? percent(used, n.traffic_limit) : null
              const barW = pct !== null ? Math.min(100, Math.max(2, pct)) : 18
              return (
                <div
                  key={n.id}
                  onClick={() => onSelectNode(n.id)}
                  className="group cursor-pointer rounded-xl bg-card-subtle p-3 transition-colors hover:bg-secondary/70"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <Country node={n} />
                      <span className="truncate font-semibold text-foreground">{n.name}</span>
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {trafficModeLabel(n.traffic_mode, lang)}
                      </span>
                      {n.traffic_reset_day > 0 && (
                        <span className="hidden text-[10px] text-muted-foreground sm:inline">
                          {tr(`每月 ${n.traffic_reset_day} 日重置`, `Resets Day ${n.traffic_reset_day}`)}
                        </span>
                      )}
                    </div>
                    <div className="tnum flex shrink-0 items-center gap-2">
                      <span className="font-medium text-foreground">
                        {n.traffic_limit > 0 ? pair(used, n.traffic_limit) : `${bytes(used)} / ${FOREVER}`}
                      </span>
                      {pct !== null && (
                        <Badge
                          variant={pct >= 90 ? "rose" : pct >= 75 ? "amber" : "blue"}
                          className="text-[10px]"
                        >
                          {pct.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--track)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        pct !== null && pct >= 90
                          ? "bg-rose-500"
                          : pct !== null && pct >= 75
                            ? "bg-amber-500"
                            : "bg-[var(--vibe-blue)]",
                      )}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Right: Renewal & Billing Schedule (5 cols) */}
        <Card className="p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-[var(--vibe-teal)]" />
              <h3 className="text-sm font-semibold">
                {tr("续费与到期日历", "Renewal Timeline")}
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {tr("按剩余天数排序", "Sorted by remaining days")}
            </span>
          </div>

          <div className="mt-2 space-y-2.5">
            {nodes.map((n) => (
              <div
                key={n.id}
                onClick={() => onSelectNode(n.id)}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-card-subtle px-3 py-2.5 text-xs transition-colors hover:bg-secondary/70"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Country node={n} />
                    <span className="truncate font-semibold">{n.name}</span>
                  </div>
                  <div className="tnum mt-0.5 text-[11px] text-muted-foreground">
                    {n.expires_at
                      ? `${tr("到期日：", "Expires: ")}${n.expires_at}`
                      : tr("长期有效 / 一次性买断", "Permanent / One-time")}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {n.price > 0 ? (
                    <span className="tnum font-semibold text-foreground">
                      {money(n.price, n.currency)} / {cycle(n.billing_cycle, lang)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{tr("免费", "Free")}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <Expiry node={n} />
                    <ArrowUpRight className="size-3 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
