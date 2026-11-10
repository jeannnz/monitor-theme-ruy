import { useState } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Cpu,
  Globe,
  ShieldCheck,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  VibeHalfGauge,
  VibeSparkline,
  VibeTickRing,
  VibeWorldMap,
} from "@/components/VibeCharts"
import { fleetStatsHistory, groupsOf, speedHistory, type Node } from "@/lib/api"
import {
  bytes,
  computeFleetHealth,
  monthUsage,
  percent,
  rate,
} from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/* ============================================================================
 * 1. Left Half: 2x2 Four-Grid KPI Quadrant ("在线可用率" 等四项合并折叠为四宫格)
 * ============================================================================ */
export function VibeKpiQuad({
  nodes,
  group,
  className,
  onSelectNode,
}: {
  nodes: Node[]
  group: string | null
  className?: string
  onSelectNode?: (id: number) => void
}) {
  const { tr } = useI18n()
  const online = nodes.filter((n) => n.online)
  const reporting = online.filter((n) => n.metrics)
  const sum = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)

  const availabilityPct = nodes.length > 0 ? (online.length / nodes.length) * 100 : 0
  const offlineCount = nodes.length - online.length

  const avgCpu =
    reporting.length > 0
      ? reporting.reduce((acc, n) => acc + n.metrics!.cpu, 0) / reporting.length
      : 0
  const busiest = reporting.reduce<Node | null>(
    (top, n) => (!top || n.metrics!.cpu > top.metrics!.cpu ? n : top),
    null,
  )

  const speeds = speedHistory.get(group) ?? []
  const stats = fleetStatsHistory.get(group) ?? []
  const nowSpeed = speeds.at(-1) ?? { rx: 0, tx: 0 }

  const totalDayRx = sum((n) => n.day_rx)
  const totalDayTx = sum((n) => n.day_tx)
  const totalMonthRx = sum((n) => n.month_rx)
  const totalMonthTx = sum((n) => n.month_tx)
  const countryCount = new Set(nodes.map((n) => n.country).filter(Boolean)).size

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {/* Cell 1: Fleet Availability */}
      <Card className="justify-between gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">
            {tr("在线率", "Availability")}
          </span>
          <span className="tnum inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {availabilityPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="tnum text-xl font-bold leading-none tracking-tight">
              {online.length}{" "}
              <span className="text-sm font-medium text-muted-foreground">/ {nodes.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={offlineCount === 0 ? "emerald" : "rose"}
                className="px-1.5 py-0 text-[10px]"
              >
                {offlineCount === 0
                  ? tr("全在线", "All Up")
                  : tr(`${offlineCount} 离线`, `${offlineCount} Down`)}
              </Badge>
              <span className="truncate text-[10px] text-muted-foreground">
                {tr(`${countryCount} 地区`, `${countryCount} Regions`)}
              </span>
            </div>
          </div>
          <div className="w-20 shrink-0">
            <VibeSparkline
              height={28}
              series={[
                {
                  values: stats.map((s) => s.onlineRatio),
                  color: "var(--vibe-teal)",
                },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Cell 2: CPU Load & Peak Host */}
      <Card
        className={cn(
          "justify-between gap-1.5 p-3.5",
          busiest && "cursor-pointer transition-colors hover:border-ring/60",
        )}
        onClick={() => busiest && onSelectNode?.(busiest.id)}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">
            {tr("CPU 负载", "CPU Load")}
          </span>
          <span className="tnum inline-flex shrink-0 items-center gap-1 text-[10px]">
            <Cpu className="size-3 text-muted-foreground" />
            {busiest ? `${tr("峰值", "Peak")} ${busiest.metrics!.cpu.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="tnum text-xl font-bold leading-none tracking-tight">
              {reporting.length > 0 ? `${avgCpu.toFixed(1)}%` : "—"}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant={busiest && busiest.metrics!.cpu >= 85 ? "amber" : "blue"}
                className="max-w-[116px] truncate px-1.5 py-0 text-[10px]"
              >
                {busiest ? `${busiest.name}` : tr("无节点", "No Nodes")}
              </Badge>
              <span className="tnum truncate text-[10px] text-muted-foreground">
                {tr(
                  `${sum((n) => n.cpu_cores)}核 · ${sum((n) => n.metrics?.procs ?? 0)}进程`,
                  `${sum((n) => n.cpu_cores)}C · ${sum((n) => n.metrics?.procs ?? 0)}P`,
                )}
              </span>
            </div>
          </div>
          <div className="w-20 shrink-0">
            <VibeSparkline
              height={28}
              series={[
                {
                  values: stats.map((s) => s.maxCpu),
                  color: "var(--vibe-cyan)",
                  dashed: true,
                },
                {
                  values: stats.map((s) => s.avgCpu),
                  color: "var(--vibe-blue)",
                },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Cell 3: Real-time Network Throughput */}
      <Card className="justify-between gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">
            {tr("实时带宽", "Throughput")}
          </span>
          <Zap className="size-3 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="tnum flex items-baseline gap-1 text-xl font-bold leading-none tracking-tight">
              <ArrowDown className="size-3.5 text-[var(--vibe-blue)]" />
              {rate(nowSpeed.rx)}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="blue" className="tnum px-1.5 py-0 text-[10px]">
                <ArrowUp className="size-2.5" /> {rate(nowSpeed.tx)}
              </Badge>
              <span className="tnum truncate text-[10px] text-muted-foreground">
                TCP {sum((n) => n.metrics?.tcp ?? 0)} · UDP {sum((n) => n.metrics?.udp ?? 0)}
              </span>
            </div>
          </div>
          <div className="w-20 shrink-0">
            <VibeSparkline
              height={28}
              series={[
                { values: speeds.map((s) => s.rx), color: "var(--vibe-blue)" },
                { values: speeds.map((s) => s.tx), color: "var(--vibe-cyan)" },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Cell 4: Monthly & Daily Traffic */}
      <Card className="justify-between gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">
            {tr("月度流量", "Monthly Traffic")}
          </span>
          <Activity className="size-3 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="tnum text-xl font-bold leading-none tracking-tight">
              {bytes(totalMonthRx + totalMonthTx)}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="emerald" className="tnum px-1.5 py-0 text-[10px]">
                {tr("今日", "Today")} {bytes(totalDayRx + totalDayTx)}
              </Badge>
              <span className="tnum truncate text-[10px] text-muted-foreground">
                ↓{bytes(totalMonthRx)} · ↑{bytes(totalMonthTx)}
              </span>
            </div>
          </div>
          <div className="w-20 shrink-0">
            <VibeSparkline
              height={28}
              series={[
                {
                  values: stats.map((s) => s.memPct),
                  color: "var(--vibe-teal)",
                },
              ]}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ============================================================================
 * 2. Right Half: Global Nodes + Cluster Status (品字形 3-State Pyramid)
 * ============================================================================ */
export function VibeAnalyticsBento({
  nodes,
  defaultMapStyle = "globe",
  className,
  onSelectNode,
}: {
  nodes: Node[]
  defaultMapStyle?: "globe" | "dotted"
  className?: string
  onSelectNode?: (id: number) => void
}) {
  const { lang, tr } = useI18n()
  const [mapMode, setMapMode] = useState<"globe" | "dotted">(defaultMapStyle)

  // 1. Global Reach metrics
  const countries = [...new Set(nodes.map((n) => n.country).filter(Boolean))]
  const groups = groupsOf(nodes)
  const onlineCount = nodes.filter((n) => n.online).length
  const onlinePct = nodes.length > 0 ? (onlineCount / nodes.length) * 100 : 100

  // 2. Simultaneous 3-Resource Watermarks (内存 / 硬盘 / 流量)
  const onlineNodes = nodes.filter((n) => n.online && n.metrics)
  const totalMem = nodes.reduce((s, n) => s + n.mem_total, 0)
  const usedMem = onlineNodes.reduce((s, n) => s + n.metrics!.mem_used, 0)
  const totalDisk = nodes.reduce((s, n) => s + n.disk_total, 0)
  const usedDisk = onlineNodes.reduce((s, n) => s + n.metrics!.disk_used, 0)
  const cappedNodes = nodes.filter((n) => n.traffic_limit > 0)
  const totalQuota = cappedNodes.reduce((s, n) => s + n.traffic_limit, 0)
  const usedQuota = cappedNodes.reduce((s, n) => s + monthUsage(n), 0)
  const totalMonthAll = nodes.reduce((s, n) => s + monthUsage(n), 0)

  const memPct = percent(usedMem, totalMem)
  const diskPct = percent(usedDisk, totalDisk)
  const quotaPct = totalQuota > 0 ? percent(usedQuota, totalQuota) : 0

  // 3. Comprehensive Cluster Load Health (CPU + RAM + Disk + Traffic)
  const health = computeFleetHealth(nodes, lang)

  const resourceItems = [
    {
      key: "mem",
      title: tr("内存", "RAM"),
      pct: memPct,
      ringLabel: `${memPct.toFixed(0)}%`,
      tone: "cyan" as const,
      detail: `${bytes(usedMem)} / ${bytes(totalMem)} (${memPct.toFixed(1)}%)`,
      tooltipPos: "left-1/2 -translate-x-1/2",
    },
    {
      key: "disk",
      title: tr("硬盘", "Disk"),
      pct: diskPct,
      ringLabel: `${diskPct.toFixed(0)}%`,
      tone: "teal" as const,
      detail: `${bytes(usedDisk)} / ${bytes(totalDisk)} (${diskPct.toFixed(1)}%)`,
      tooltipPos: "left-1/2 -translate-x-1/2",
    },
    {
      key: "traffic",
      title: tr("流量", "Traffic"),
      pct: totalQuota > 0 ? quotaPct : 45,
      ringLabel: totalQuota > 0 ? `${quotaPct.toFixed(0)}%` : "∞",
      tone: "blue" as const,
      detail:
        totalQuota > 0
          ? `${bytes(usedQuota)} / ${bytes(totalQuota)} (${quotaPct.toFixed(1)}%)`
          : `${bytes(totalMonthAll)} / ∞`,
      tooltipPos: "right-0",
    },
  ] as const

  const renderResourceRing = (item: (typeof resourceItems)[number]) => (
    <div
      key={item.key}
      tabIndex={0}
      className="group relative flex cursor-default flex-col items-center rounded-xl px-2.5 py-1 outline-none transition-colors hover:bg-card-subtle/85 focus-visible:bg-card-subtle/85"
    >
      {/* Hover-Only Top Tag (鼠标悬浮在对应子模块上方时才显示标签) */}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute bottom-full z-30 mb-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900/95 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg backdrop-blur-xs transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 dark:bg-slate-800/95",
          item.tooltipPos,
        )}
      >
        <span className="font-semibold text-[var(--vibe-cyan)]">{item.title}</span>
        <span className="mx-1.5 opacity-50">·</span>
        <span className="tnum">{item.detail}</span>
      </div>

      <VibeTickRing
        percent={item.pct}
        label={item.ringLabel}
        size={62}
        ticks={44}
        tone={item.tone}
      />
      <span className="mt-1 text-[11px] font-medium leading-none text-muted-foreground transition-colors group-hover:text-foreground">
        {item.title}
      </span>
    </div>
  )

  return (
    <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      {/* Panel 1: Global Nodes (Auto-Spinning 3D Globe / Dotted Map) */}
      <Card className="justify-between gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Globe className="size-3.5 shrink-0 text-[var(--vibe-blue)]" />
            <h3 className="truncate text-xs font-semibold">
              {tr("全球节点", "Global Nodes")}
            </h3>
          </div>
          <div className="inline-flex shrink-0 rounded-lg bg-secondary p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setMapMode("globe")}
              className={cn(
                "cursor-pointer whitespace-nowrap rounded-md px-2 py-0.5 font-medium transition-colors",
                mapMode === "globe" ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground",
              )}
            >
              {tr("3D 地球", "3D Globe")}
            </button>
            <button
              type="button"
              onClick={() => setMapMode("dotted")}
              className={cn(
                "cursor-pointer whitespace-nowrap rounded-md px-2 py-0.5 font-medium transition-colors",
                mapMode === "dotted" ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground",
              )}
            >
              {tr("点阵图", "Dotted")}
            </button>
          </div>
        </div>

        {mapMode === "globe" ? (
          <div className="my-auto flex items-center justify-between gap-3">
            <VibeWorldMap
              nodes={nodes}
              mode="globe"
              onSelectNode={onSelectNode}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between rounded-lg bg-card-subtle px-2.5 py-1.5 text-xs">
                <span className="truncate text-[11px] text-muted-foreground">
                  {tr("地区", "Regions")}
                </span>
                <span className="tnum font-bold text-foreground">{countries.length || 1}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-card-subtle px-2.5 py-1.5 text-xs">
                <span className="truncate text-[11px] text-muted-foreground">
                  {tr("分组", "Groups")}
                </span>
                <span className="tnum font-bold text-foreground">{groups.length || 1}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-card-subtle px-2.5 py-1.5 text-xs">
                <span className="truncate text-[11px] text-muted-foreground">
                  {tr("在线", "Active")}
                </span>
                <span className="tnum font-bold text-[var(--vibe-teal)]">
                  {onlineCount}
                  <span className="text-[10px] font-normal text-muted-foreground">/{nodes.length}</span>
                </span>
              </div>
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">{tr("在线率", "Coverage")}</span>
                  <span className="tnum font-semibold text-foreground">{onlinePct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className="h-full rounded-full bg-[var(--vibe-blue)] transition-all"
                    style={{ width: `${onlinePct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="my-auto">
            <VibeWorldMap
              nodes={nodes}
              mode="dotted"
              onSelectNode={onSelectNode}
            />
          </div>
        )}
      </Card>

      {/* Panel 2: 集群状态 (Left: Cluster Load Health Gauge; Right: 品字形 Dense Rings with Hover Tags) */}
      <Card className="justify-between gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0 text-[var(--vibe-blue)]" />
            <h3 className="truncate text-xs font-semibold">
              {tr("集群状态", "Cluster Status")}
            </h3>
          </div>
          {health.busyNodes > 0 && (
            <span className="tnum shrink-0 rounded-full bg-amber-500/12 px-2 py-0.2 text-[10px] font-medium text-amber-600 dark:text-amber-300">
              {tr(`${health.busyNodes} 高载`, `${health.busyNodes} Busy`)}
            </span>
          )}
        </div>

        {/* Body: Left = Comprehensive Cluster Load Health; Right = 品字形 (1-Over-2) Dense Tick Rings */}
        <div className="my-auto grid grid-cols-[118px_minmax(0,1fr)] items-center gap-2">
          {/* Left Column: Comprehensive Cluster Load Health Gauge (CPU + RAM + Disk + Traffic) */}
          <div
            tabIndex={0}
            className="group relative flex h-full cursor-default flex-col items-center justify-center rounded-xl bg-card-subtle/60 px-2 py-2 outline-none transition-colors hover:bg-card-subtle"
          >
            {/* Hover Tag showing 4-dimension load synthesis */}
            <div
              role="tooltip"
              className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-slate-900/95 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg backdrop-blur-xs transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 dark:bg-slate-800/95"
            >
              <span className="tnum">
                CPU {health.cpuLoad.toFixed(0)}% · {tr("内存", "RAM")} {health.memLoad.toFixed(0)}% ·{" "}
                {tr("硬盘", "Disk")} {health.diskLoad.toFixed(0)}% · {tr("流量", "Traffic")}{" "}
                {health.trafficLoad !== null ? `${health.trafficLoad.toFixed(0)}%` : "∞"}
              </span>
            </div>

            <VibeHalfGauge
              score={health.score}
              statusLabel={health.statusLabel}
              statusTone={health.statusTone}
              compact
            />
            <div className="mt-1.5 text-center leading-tight">
              <div className="text-[11px] font-semibold text-foreground">
                {tr("集群负载", "Cluster Load")}
              </div>
              <div className="tnum mt-0.5 text-[10px] text-muted-foreground">
                {tr("综合", "Composite")} {health.compositeLoad.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Right Column: 品字形 (1 Top Centered: 内存; 2 Bottom Side-by-Side: 硬盘 + 流量) */}
          <div className="flex flex-col items-center justify-center">
            {/* Top Apex: 内存 */}
            <div className="flex justify-center">
              {renderResourceRing(resourceItems[0])}
            </div>
            {/* Bottom Base: 硬盘 + 流量 */}
            <div className="-mt-1 grid w-full grid-cols-2 justify-items-center">
              {renderResourceRing(resourceItems[1])}
              {renderResourceRing(resourceItems[2])}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function Summary({
  nodes,
  group,
  showKpi = true,
  showAnalytics = true,
  mapStyle = "globe",
  onSelectNode,
}: {
  nodes: Node[]
  group: string | null
  showKpi?: boolean
  showAnalytics?: boolean
  mapStyle?: "globe" | "dotted"
  onSelectNode?: (id: number) => void
}) {
  if (!showKpi && !showAnalytics) return null

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
      {showKpi && (
        <VibeKpiQuad
          nodes={nodes}
          group={group}
          className={showAnalytics ? "xl:col-span-6" : "xl:col-span-12"}
          onSelectNode={onSelectNode}
        />
      )}
      {showAnalytics && (
        <VibeAnalyticsBento
          nodes={nodes}
          defaultMapStyle={mapStyle}
          className={showKpi ? "xl:col-span-6" : "xl:col-span-12"}
          onSelectNode={onSelectNode}
        />
      )}
    </div>
  )
}
export { ArrowUpRight }

