import { useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from "recharts"
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  HardDrive,
  Layers,
  Lock,
  MessageSquareText,
  Network,
  Radio,
  Server,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Country, Expiry, OsIcon, Status } from "@/components/NodeCard"
import { VibeTickRing } from "@/components/VibeCharts"
import { api, classifyProbeHealth, type Node } from "@/lib/api"
import {
  axisBytes,
  axisTop,
  bytes,
  clockFor,
  cpuName,
  cycle,
  despike,
  money,
  monthUsage,
  osName,
  pair,
  percent,
  quarters,
  rate,
  RATE_FLOOR,
  rateAxis,
  tickClock,
  timeTicks,
  trafficModeLabel,
  windows,
  withGaps,
} from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Point = {
  ts: number
  minutes?: number
  cpu: number
  cpu_max?: number
  mem_used: number
  swap_used?: number
  disk_used: number
  net_rx: number
  net_tx: number
  net_rx_max?: number
  net_tx_max?: number
  tcp?: number
  udp?: number
  procs?: number
}

type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

type Probes = Record<string, string>
type Loss = Record<string, number>

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

const SERIES = { dot: false as const, strokeWidth: 1.75, isAnimationActive: false }

const RESOURCE_SERIES = {
  ...SERIES,
  dot: ({ cx, cy, index, points, stroke }: DotItemDotProps) =>
    cy == null || points[index - 1]?.y != null || points[index + 1]?.y != null ? null : (
      <circle cx={cx} cy={cy} r={2.2} fill={stroke} />
    ),
}

const TOOLTIP = {
  isAnimationActive: false,
  labelFormatter: (ts: unknown) => new Date(Number(ts)).toLocaleString(),
  contentStyle: {
    fontSize: 12,
    borderRadius: "12px",
    borderColor: "var(--border)",
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
    boxShadow: "0 8px 24px -4px rgb(0 0 0 / 0.15)",
  },
}

const VALUE_AXIS = { ...AXIS, width: 66, interval: 0 }

// Vibe Multi-Probe Color Palette (Blue, Cyan, Teal, Indigo, Amber)
const PALETTE = [
  { stroke: "var(--chart-1)", dash: undefined },
  { stroke: "var(--chart-2)", dash: undefined },
  { stroke: "var(--chart-3)", dash: undefined },
  { stroke: "var(--chart-4)", dash: "5 3" },
  { stroke: "var(--chart-5)", dash: "2 3" },
]

function ChartCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div className="h-48 w-full text-muted-foreground">{children}</div>
    </Card>
  )
}

function despikeWindow(points: { ts: number }[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].ts - points[i - 1].ts)
  if (!Number.isFinite(step) || step <= 0) return 3
  return Math.min(15, Math.max(3, Math.round(420 / step) | 1))
}

export function NodeDetail({
  node,
  nodes = [],
  historyDays,
  showBilling = true,
  initialTab = "resources",
  onBack,
  onSelectNode,
}: {
  node: Node
  nodes?: Node[]
  historyDays: number
  showBilling?: boolean
  initialTab?: "resources" | "latency"
  onBack?: () => void
  onSelectNode?: (id: number) => void
}) {
  const { lang, tr } = useI18n()
  const ranges = useMemo(() => windows(historyDays, lang), [historyDays, lang])
  const [tab, setTab] = useState<"resources" | "latency">(initialTab)
  const [picked, setPicked] = useState({ resources: 6, latency: 6 })
  const hours = picked[tab]
  const [smooth, setSmooth] = useState(false)
  const [hiddenProbes, setHiddenProbes] = useState<number[]>([])
  const [data, setData] = useState<{
    metrics: Point[]
    ping: PingPoint[]
    step?: number
    probes: Probes
    loss?: Loss
  } | null>(null)
  const [failed, setFailed] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [zoom, setZoom] = useState<[number, number] | null>(null)

  useEffect(() => {
    let active = true
    // oxlint-disable-next-line react/set-state-in-effect
    setData(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setZoom(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setFailed("")
    const points = Math.round(globalThis.innerWidth * (globalThis.devicePixelRatio || 1))
    const series = tab === "latency" ? "ping" : "metrics"
    api<{ metrics: Point[]; ping: PingPoint[]; step?: number; probes: Probes; loss?: Loss }>(
      `/nodes/${node.id}/metrics?hours=${hours}&points=${points}&series=${series}`,
    )
      .then((next) => {
        if (active) setData(next)
      })
      .catch((e: Error) => {
        if (active) {
          setFailed(e.message)
          setData({ metrics: [], ping: [], probes: {} })
        }
      })
    return () => {
      active = false
    }
  }, [node.id, hours, tab, attempt])

  const m = node.metrics

  // Prev / Next node navigation
  const currentIdx = nodes.findIndex((n) => n.id === node.id)
  const prevNode = currentIdx > 0 ? nodes[currentIdx - 1] : null
  const nextNode = currentIdx >= 0 && currentIdx < nodes.length - 1 ? nodes[currentIdx + 1] : null

  const pingSeries = useMemo(() => {
    const rawPing = Array.isArray(data?.ping) ? data.ping : []
    const validPing = rawPing
      .filter(
        (p): p is PingPoint =>
          Boolean(p) &&
          typeof p.task_id === "number" &&
          Number.isFinite(p.task_id) &&
          typeof p.ts === "number" &&
          Number.isFinite(p.ts) &&
          p.ts > 0,
      )
      .map((p) => {
        const lat =
          typeof p.latency === "number" && Number.isFinite(p.latency) && p.latency >= 0 && p.latency <= 60_000
            ? p.latency
            : null
        return { ...p, latency: lat }
      })

    return [...new Set(validPing.map((p) => p.task_id))]
      .map((id) => {
        const points = validPing.filter((p) => p.task_id === id).sort((a, b) => a.ts - b.ts)
        const answered = points.map((p) => p.latency).filter((v): v is number => v !== null)
        const sorted = [...answered].sort((a, b) => a - b)
        const medianLat =
          sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null
        const minLat = sorted.length > 0 ? Math.round(sorted[0]) : null
        const maxLat = sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : null
        const p10 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.1)] : 0
        const p90 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0
        const jitterMs = sorted.length >= 2 ? Math.max(0, Math.round(p90 - p10)) : 0
        const rawLoss = data?.loss?.[String(id)] ?? data?.loss?.[id]
        const fallbackLoss =
          points.length > 0 ? ((points.length - answered.length) / points.length) * 100 : 0
        const loss =
          typeof rawLoss === "number" && Number.isFinite(rawLoss)
            ? Math.min(100, Math.max(0, rawLoss))
            : fallbackLoss
        const health = classifyProbeHealth(medianLat, loss, jitterMs)
        return {
          id,
          name: data?.probes?.[id] ?? `${tr("探测", "Probe")} ${id}`,
          points,
          loss,
          medianLat,
          minLat,
          maxLat,
          jitterMs,
          health,
        }
      })
      .filter((s) => s.points.length > 0)
  }, [data, tr])

  const metricRows = useMemo(() => {
    const lift = (v: number) => Math.max(v, RATE_FLOOR)
    return (data?.metrics ?? []).map((p) => ({
      ...p,
      ts: p.ts * 1_000,
      cpu_band: [p.cpu, Math.max(p.cpu, p.cpu_max ?? p.cpu)] as [number, number],
      rx: lift(p.net_rx),
      tx: lift(p.net_tx),
      rx_band: [lift(p.net_rx), lift(p.net_rx_max ?? p.net_rx)] as [number, number],
      tx_band: [lift(p.net_tx), lift(p.net_tx_max ?? p.net_tx)] as [number, number],
    }))
  }, [data])

  const chartRows = useMemo(() => withGaps(metricRows), [metricRows])

  const peak = useMemo(() => {
    const rows = data?.metrics ?? []
    if (!rows.some((r) => r.net_rx_max !== undefined)) return null
    const max = (pick: (r: Point) => number | undefined) =>
      rows.reduce((hi, r) => Math.max(hi, pick(r) ?? 0), 0)
    return {
      rx: max((r) => r.net_rx_max),
      tx: max((r) => r.net_tx_max),
      cpu: max((r) => r.cpu_max ?? r.cpu),
    }
  }, [data])

  // Check if historical connections/procs exist (Hub 1.4.0+)
  const hasConnHistory = useMemo(
    () => (data?.metrics ?? []).some((r) => typeof r.tcp === "number" || typeof r.procs === "number"),
    [data],
  )

  // Compute bucket availability strip from `minutes` and `step`
  const availabilityBuckets = useMemo(() => {
    const rows = data?.metrics ?? []
    const stepMinutes = Math.max(1, (data?.step ?? 60) / 60)
    if (rows.length === 0 || !rows.some((r) => typeof r.minutes === "number")) return null
    const count = Math.min(48, rows.length)
    const size = rows.length / count
    const bars: { ts: number; ratio: number }[] = []
    for (let i = 0; i < count; i++) {
      const slice = rows.slice(Math.floor(i * size), Math.max(Math.floor(i * size) + 1, Math.floor((i + 1) * size)))
      const isLast = i === count - 1
      const avgRatio =
        slice.reduce((acc, r, idx) => {
          if (isLast && idx === slice.length - 1) return acc + 1
          return acc + Math.min(1, (r.minutes ?? stepMinutes) / stepMinutes)
        }, 0) / slice.length
      bars.push({ ts: slice[0].ts * 1000, ratio: avgRatio * 100 })
    }
    const overall = bars.reduce((s, b) => s + b.ratio, 0) / bars.length
    return { bars, overall }
  }, [data])

  const axes = useMemo(() => {
    const max = (pick: (r: (typeof metricRows)[number]) => number) =>
      metricRows.reduce((hi, r) => Math.max(hi, pick(r)), 0)
    const cpu = axisTop(max((r) => r.cpu_band[1]), 4, 100)
    return {
      cpu: { domain: [0, cpu], ticks: quarters(cpu) },
      rate: rateAxis(
        metricRows.reduce((lo, r) => Math.min(lo, r.rx, r.tx), Infinity),
        max((r) => Math.max(r.rx_band[1], r.tx_band[1])),
      ),
    }
  }, [metricRows])

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  const style = (id: number) => PALETTE[pingSeries.findIndex((p) => p.id === id) % PALETTE.length]

  const pingRows = useMemo(() => {
    type Row = { ts: number } & Record<string, number | [number, number] | null>
    const rows = new Map<number, Row>()
    for (const s of pingSeries) {
      const windowSize = despikeWindow(s.points)
      const smoothed = despike(s.points.map((p) => p.latency), windowSize)
      const lo = despike(s.points.map((p) => p.band?.[0] ?? p.latency), windowSize)
      const hi = despike(s.points.map((p) => p.band?.[1] ?? p.latency), windowSize)
      s.points.forEach((p, i) => {
        const row: Row = rows.get(p.ts) ?? { ts: p.ts * 1_000 }
        row[`t${s.id}`] = p.latency
        row[`s${s.id}`] = smoothed[i]
        row[`l${s.id}`] = p.loss ?? 0
        row[`b${s.id}`] = p.band ?? (p.latency === null ? null : [p.latency, p.latency])
        const [low, high] = [lo[i], hi[i]]
        row[`c${s.id}`] =
          low === null || high === null
            ? null
            : [Math.min(low, high, smoothed[i] ?? low), Math.max(low, high, smoothed[i] ?? high)]
        rows.set(p.ts, row)
      })
    }
    return [...rows.values()].sort((a, b) => a.ts - b.ts)
  }, [pingSeries])

  const timeAxis = (rows: { ts: number }[], from = 0, to = rows.length - 1) => {
    const ticks = rows.length ? timeTicks(rows[from].ts, rows[to].ts) : []
    return {
      dataKey: "ts",
      type: "number" as const,
      domain: ["dataMin", "dataMax"] as const,
      ticks,
      tickFormatter: tickClock(ticks, hours),
      minTickGap: hours > 24 ? 72 : 40,
      ...AXIS,
    }
  }

  const memPct = m ? percent(m.mem_used, m.mem_total) : 0
  const diskPct = m ? percent(m.disk_used, m.disk_total) : 0
  const trafficPct = node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : 0

  // Overall median across shown probes for the Edge Latency sidebar
  const fleetMedianLatency = useMemo(() => {
    const valid = shownProbes.map((p) => p.medianLat).filter((v): v is number => v !== null)
    if (valid.length === 0) return null
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
  }, [shownProbes])

  const tabs = [
    { key: "resources" as const, label: tr("系统资源", "System Resources") },
    { key: "latency" as const, label: tr("网络延迟与丢包", "Edge Latency & Loss") },
  ]

  return (
    <div className="space-y-4">
      {/* Top Navigation & Node Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="size-3.5" /> {tr("返回看板", "Back to Dashboard")}
            </Button>
          )}
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <span>{tr("节点监控", "Monitoring")}</span>
            <span>/</span>
            <span className="font-medium text-foreground">{node.name}</span>
          </div>
        </div>

        {nodes.length > 1 && onSelectNode && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={!prevNode}
              onClick={() => prevNode && onSelectNode(prevNode.id)}
              title={prevNode ? `${tr("上一节点", "Previous")}: ${prevNode.name}` : undefined}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <select
              value={node.id}
              onChange={(e) => onSelectNode(Number(e.target.value))}
              aria-label={tr("切换服务器节点", "Switch server node")}
              className="h-8 max-w-[210px] rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground outline-none focus:border-ring"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.online ? "● " : "○ "}
                  {n.name} {n.group ? `[${n.group}]` : ""}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!nextNode}
              onClick={() => nextNode && onSelectNode(nextNode.id)}
              title={nextNode ? `${tr("下一节点", "Next")}: ${nextNode.name}` : undefined}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Node Hero Identity Card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Country node={node} className="h-4 w-6" />
              <h2 className="truncate text-lg font-bold tracking-tight" title={node.name}>
                {node.name}
              </h2>
              <Status node={node} />
              {node.group && <Badge variant="blue">{node.group}</Badge>}
              {node.agent_version && (
                <Badge variant="outline" className="tnum">
                  agent v{node.agent_version}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {node.os && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <OsIcon os={node.os} />
                  {[osName(node.os), node.kernel].filter(Boolean).join(" · ")}
                </span>
              )}
              <span>
                <Cpu className="mr-1 inline size-3.5" />
                {node.cpu_name
                  ? `${cpuName(node.cpu_name)} × ${node.cpu_cores} ${tr("核", "Cores")}`
                  : `${node.cpu_cores} ${tr("核", "Cores")}`}
              </span>
              {node.arch && (
                <span>
                  <Server className="mr-1 inline size-3.5" />
                  {[node.arch, node.virt && node.virt !== "none" ? node.virt.toUpperCase() : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              {(node.ip || node.ipv4 || node.hostname) && (
                <span className="tnum rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {[node.hostname, node.ip || node.ipv4, node.ipv6].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>

          {showBilling && (
            <div className="flex flex-col items-end gap-1 rounded-xl bg-card-subtle px-3.5 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="tnum font-semibold text-foreground">
                  {node.price > 0
                    ? `${money(node.price, node.currency)} / ${cycle(node.billing_cycle, lang)}`
                    : tr("免费 / 自有节点", "Free / Self-hosted")}
                </span>
                <Expiry node={node} />
              </div>
              <span className="tnum text-[11px] text-muted-foreground">
                {node.expires_at
                  ? `${tr("到期日期：", "Expires: ")}${node.expires_at}`
                  : tr("无到期限制", "No expiry limit")}
              </span>
            </div>
          )}
        </div>

        {(node.public_remark || node.remark) && (
          <div className="mt-2 flex flex-wrap gap-2 border-t pt-3 text-xs">
            {node.public_remark && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-foreground">
                <MessageSquareText className="size-3.5 shrink-0" />
                <span>{node.public_remark}</span>
              </div>
            )}
            {node.remark && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/12 px-3 py-1.5 font-medium text-amber-600 dark:text-amber-300">
                <Lock className="size-3.5 shrink-0" />
                <span>
                  {tr("管理员备注：", "Admin Note: ")}
                  {node.remark}
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Vibe 4-Column Live Gauges & Real-Time Metrics Row */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Gauge 1: CPU & System Load */}
        <Card className="items-center justify-between p-4">
          <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("CPU 实时占用", "Live CPU Usage")}</span>
            <Cpu className="size-3.5 text-[var(--vibe-blue)]" />
          </div>
          <VibeTickRing
            size={136}
            ticks={56}
            tone="blue"
            percent={m ? m.cpu : 0}
            label={m ? `${m.cpu.toFixed(1)}%` : "—"}
            sublabel={tr(`${node.cpu_cores} 核处理器`, `${node.cpu_cores}-Core CPU`)}
          />
          <div className="tnum flex w-full items-center justify-between rounded-lg bg-card-subtle px-3 py-1.5 text-[11px]">
            <span className="text-muted-foreground">{tr("系统负载 (1/5/15m)", "Load Avg (1/5/15m)")}</span>
            <span className="font-semibold text-foreground">
              {m ? m.load.map((v) => v.toFixed(2)).join(" / ") : "—"}
            </span>
          </div>
        </Card>

        {/* Gauge 2: Memory & Swap */}
        <Card className="items-center justify-between p-4">
          <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("物理内存与交换分区", "Memory & Swap")}</span>
            <Activity className="size-3.5 text-[var(--vibe-cyan)]" />
          </div>
          <VibeTickRing
            size={136}
            ticks={56}
            tone="cyan"
            percent={memPct}
            label={m ? `${memPct.toFixed(0)}%` : "—"}
            sublabel={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
          />
          <div className="tnum flex w-full items-center justify-between rounded-lg bg-card-subtle px-3 py-1.5 text-[11px]">
            <span className="text-muted-foreground">{tr("Swap 交换空间", "Swap Memory")}</span>
            <span className="font-semibold text-foreground">
              {node.swap_total > 0
                ? m
                  ? `${pair(m.swap_used, m.swap_total)} (${percent(m.swap_used, m.swap_total).toFixed(0)}%)`
                  : bytes(node.swap_total)
                : tr("未启用", "Disabled")}
            </span>
          </div>
        </Card>

        {/* Gauge 3: Disk & Monthly Traffic Quota */}
        <Card className="items-center justify-between p-4">
          <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("磁盘与月流量配额", "Disk & Traffic Quota")}</span>
            <HardDrive className="size-3.5 text-[var(--vibe-teal)]" />
          </div>
          <VibeTickRing
            size={136}
            ticks={56}
            tone="teal"
            percent={node.traffic_limit > 0 ? trafficPct : diskPct}
            label={
              node.traffic_limit > 0
                ? `${trafficPct.toFixed(0)}%`
                : m
                  ? `${diskPct.toFixed(0)}%`
                  : "—"
            }
            sublabel={
              node.traffic_limit > 0
                ? pair(monthUsage(node), node.traffic_limit)
                : m
                  ? pair(m.disk_used, m.disk_total)
                  : bytes(node.disk_total)
            }
          />
          <div className="tnum flex w-full items-center justify-between rounded-lg bg-card-subtle px-3 py-1.5 text-[11px]">
            <span className="text-muted-foreground">{tr("硬盘已用 / 总量", "Disk Used / Total")}</span>
            <span className="font-semibold text-foreground">
              {m ? `${pair(m.disk_used, m.disk_total)} (${diskPct.toFixed(0)}%)` : bytes(node.disk_total)}
            </span>
          </div>
        </Card>

        {/* Card 4: Live Network & Connections Spec */}
        <Card className="justify-between p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">{tr("网络吞吐与连接状态", "Network & Connections")}</span>
            <Network className="size-3.5 text-[var(--vibe-blue)]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-card-subtle p-2.5">
              <div className="text-[10px] text-muted-foreground">{tr("实时下行 (Rx)", "Inbound (Rx)")}</div>
              <div className="tnum mt-0.5 flex items-center gap-1 text-sm font-bold text-foreground">
                <ArrowDown className="size-3.5 text-[var(--vibe-blue)]" />
                {m ? rate(m.net_rx) : "—"}
              </div>
            </div>
            <div className="rounded-xl bg-card-subtle p-2.5">
              <div className="text-[10px] text-muted-foreground">{tr("实时上行 (Tx)", "Outbound (Tx)")}</div>
              <div className="tnum mt-0.5 flex items-center gap-1 text-sm font-bold text-foreground">
                <ArrowUp className="size-3.5 text-[var(--vibe-cyan)]" />
                {m ? rate(m.net_tx) : "—"}
              </div>
            </div>
          </div>

          <div className="tnum space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{tr("今日流量", "Today")}</span>
              <span className="font-medium">↓ {bytes(node.day_rx)} · ↑ {bytes(node.day_tx)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {tr("本月流量", "Month")} ({trafficModeLabel(node.traffic_mode, lang)})
              </span>
              <span className="font-medium">↓ {bytes(node.month_rx)} · ↑ {bytes(node.month_tx)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{tr("累计总流量", "Total")}</span>
              <span className="font-medium">↓ {bytes(node.total_rx)} · ↑ {bytes(node.total_tx)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1.5">
              <span className="text-muted-foreground">{tr("并发连接 / 进程", "Connections / Procs")}</span>
              <span className="font-semibold text-foreground">
                {m ? `TCP ${m.tcp} · UDP ${m.udp} · ${m.procs}` : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Availability Heat Strip (computed from `minutes` & `step`) */}
      {availabilityBuckets && (
        <Card className="gap-2 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Clock className="size-3.5 text-[var(--vibe-teal)]" />
              {tr("窗口在线率", "Availability Timeline")}
            </span>
            <Badge variant="emerald" className="tnum">
              {availabilityBuckets.overall.toFixed(2)}% {tr("在线", "Uptime")}
            </Badge>
          </div>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-md">
            {availabilityBuckets.bars.map((b, i) => (
              <div
                key={i}
                title={`${new Date(b.ts).toLocaleString()} · ${tr("在线率", "Uptime")} ${b.ratio.toFixed(0)}%`}
                className={cn(
                  "h-full flex-1 rounded-[2px] transition-opacity hover:opacity-80",
                  b.ratio >= 98
                    ? "bg-[var(--vibe-teal)]"
                    : b.ratio >= 50
                      ? "bg-amber-400"
                      : "bg-rose-500/70",
                )}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Chart Control Bar: Tabs + Time Window Buttons + Despike Toggle */}
      <Card className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-xl bg-secondary p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                tab === t.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tab === "latency" && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(e) => setSmooth(e.target.checked)}
                className="size-3.5 accent-[var(--vibe-blue)]"
              />
              {tr("削峰滤波", "Despike")}
            </label>
          )}
          <div className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
            {ranges.map((r) => (
              <button
                key={r.hours}
                type="button"
                aria-pressed={hours === r.hours}
                onClick={() => setPicked((all) => ({ ...all, [tab]: r.hours }))}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  hours === r.hours
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Historical Charts Body */}
      {!data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : failed ? (
        <Card className="items-center justify-center py-12 text-center">
          <p className="text-sm text-destructive" role="alert">
            {tr("读取历史数据失败：", "Failed to load history: ")}
            {failed}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
            {tr("重试加载", "Retry")}
          </Button>
        </Card>
      ) : tab === "latency" ? (
        pingSeries.length === 0 ? (
          <Card className="py-14 text-center text-sm text-muted-foreground">
            {tr("该时间窗口内暂无网络延迟探测记录", "No latency probe records in this time window")}
          </Card>
        ) : (
          /* Vibe "Edge Latency" Split Card */
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3.5">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-[var(--vibe-blue)]" />
                <h3 className="text-base font-semibold">
                  {tr("多线延迟与丢包", "Edge Latency & Packet Loss")}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" /> {tr("优良", "Optimal")} (&lt;60ms)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[var(--vibe-blue)]" /> {tr("正常", "Normal")} (60–150ms)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-500" /> {tr("波动", "Jitter")} (&gt;150ms / ≥1%)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-500" /> {tr("告警", "Alert")} (≥10% {tr("丢包", "Loss")})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 pt-2 lg:grid-cols-[276px_minmax(0,1fr)]">
              {/* Left Sidebar inside Edge Latency Card */}
              <div className="flex flex-col justify-between rounded-2xl bg-card-subtle p-4">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {tr("中位响应延迟", "Median Response Latency")}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="tnum text-3xl font-bold tracking-tight">
                      {fleetMedianLatency !== null ? `${fleetMedianLatency} ms` : tr("超时", "Timeout")}
                    </span>
                    <Badge variant="emerald" className="text-[11px]">
                      {tr(`${shownProbes.length} 线路`, `${shownProbes.length} Probes`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {tr(
                      "点击下方探测目标可过滤或叠加对比曲线",
                      "Click any probe target below to filter or compare latency curves",
                    )}
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>{tr("探测目标", "Probe Target")}</span>
                      <span>{tr("中位延迟 / 丢包", "Median / Loss")}</span>
                    </div>

                    {pingSeries.map((s) => {
                      const shown = !hiddenProbes.includes(s.id)
                      const lat = s.medianLat ?? 0
                      const barPct = s.medianLat === null ? 100 : Math.min(100, Math.max(6, (lat / 260) * 100))
                      const healthTag =
                        s.health === "critical"
                          ? s.medianLat === null
                            ? tr("超时", "Timeout")
                            : tr("高丢包", "High Loss")
                          : s.health === "jitter"
                            ? tr("波动", "Jitter")
                            : s.health === "good"
                              ? tr("正常", "Normal")
                              : tr("优良", "Optimal")
                      const healthColor =
                        s.health === "critical"
                          ? "text-rose-500"
                          : s.health === "jitter"
                            ? "text-amber-500"
                            : s.health === "good"
                              ? "text-[var(--vibe-blue)]"
                              : "text-emerald-500"
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={shown}
                          onClick={() =>
                            setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((id) => id !== s.id)))
                          }
                          className={cn(
                            "w-full cursor-pointer rounded-xl bg-card p-2.5 text-left transition-all hover:ring-1 hover:ring-ring/50",
                            s.health === "critical" && "ring-1 ring-rose-500/30",
                            !shown && "opacity-45",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                              <span
                                className="size-2.5 shrink-0 rounded-[3px]"
                                style={{ backgroundColor: style(s.id).stroke }}
                              />
                              <span className="truncate">{s.name}</span>
                              <span className={cn("shrink-0 text-[10px] font-medium", healthColor)}>
                                [{healthTag}]
                              </span>
                            </span>
                            <span className="tnum shrink-0 font-semibold">
                              {s.medianLat !== null ? `${s.medianLat} ms` : tr("超时", "Timeout")}
                              {s.loss > 0 && (
                                <span
                                  className={cn(
                                    "ml-1 text-[11px] font-normal",
                                    s.loss >= 10 ? "font-semibold text-rose-500" : "text-amber-500",
                                  )}
                                >
                                  · {tr("丢", "Loss")} {s.loss < 1 ? "<1" : Math.round(s.loss)}%
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${barPct}%`,
                                backgroundColor:
                                  s.medianLat === null ? "rgb(244 63 94)" : style(s.id).stroke,
                              }}
                            />
                          </div>
                          {s.minLat !== null && s.maxLat !== null && (
                            <div className="tnum mt-1 flex justify-between text-[10px] text-muted-foreground">
                              <span>
                                {tr("最低", "Min")} {s.minLat} ms
                              </span>
                              <span>
                                {tr("抖动", "Jitter")} ±{s.jitterMs} ms
                              </span>
                              <span>
                                {tr("最高", "Max")} {s.maxLat} ms
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 border-t pt-2.5 text-[11px] text-muted-foreground">
                  {tr(
                    "拖动底部时间轴滑块可局部放大查看抖动细节",
                    "Drag the bottom timeline brush to zoom into jitter intervals",
                  )}
                </div>
              </div>

              {/* Right Main Latency Chart */}
              <div className="h-[360px] min-w-0 w-full text-muted-foreground">
                {shownProbes.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm">
                    {tr("请至少在左侧勾选一条探测线路", "Select at least one probe target on the left")}
                  </div>
                ) : fleetMedianLatency === null ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-6 text-center">
                    <span className="text-sm font-semibold text-rose-500">
                      {tr("所选探测线路在该时间窗口内全部超时 (100% 丢包)", "All selected probes timed out (100% packet loss) in this window")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {tr("请检查目标端口连通性或切换其他时间范围查看历史记录", "Verify target port reachability or switch to a wider time window")}
                    </span>
                  </div>
                ) : (
                  <ResponsiveContainer>
                    <ComposedChart data={pingRows}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        {...timeAxis(
                          pingRows,
                          Math.min(zoom?.[0] ?? 0, pingRows.length - 1),
                          Math.min(zoom?.[1] ?? pingRows.length - 1, pingRows.length - 1),
                        )}
                      />
                      <YAxis unit="ms" width={54} domain={["auto", "auto"]} {...AXIS} />
                      <Tooltip
                        {...TOOLTIP}
                        formatter={(v, name, item) => {
                          if (v === null || v === undefined || !Number.isFinite(Number(v))) {
                            return [tr("超时 (100% 丢包)", "Timeout (100% Loss)"), name]
                          }
                          const loss = Number(item?.payload?.[`l${String(item.dataKey).slice(1)}`] ?? 0)
                          return [
                            `${Math.round(Number(v))} ms${loss > 0 ? ` · ${tr("丢包", "Loss")} ${loss}%` : ""}`,
                            name,
                          ]
                        }}
                      />
                      {shownProbes.length === 1 &&
                        shownProbes.map((s) => (
                          <Area
                            key={`band${s.id}`}
                            dataKey={`${smooth ? "c" : "b"}${s.id}`}
                            stroke="none"
                            fill={style(s.id).stroke}
                            fillOpacity={0.18}
                            isAnimationActive={false}
                            tooltipType="none"
                            legendType="none"
                            connectNulls
                          />
                        ))}
                      {shownProbes.map((s) => (
                        <Line
                          key={s.id}
                          dataKey={`${smooth ? "s" : "t"}${s.id}`}
                          name={s.name}
                          stroke={style(s.id).stroke}
                          strokeDasharray={style(s.id).dash}
                          {...SERIES}
                          connectNulls
                        />
                      ))}
                      <Brush
                        dataKey="ts"
                        height={24}
                        travellerWidth={8}
                        tickFormatter={clockFor(hours)}
                        className="fill-muted"
                        stroke="var(--muted-foreground)"
                        onChange={(r) => setZoom([r.startIndex ?? 0, r.endIndex ?? pingRows.length - 1])}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </Card>
        )
      ) : data.metrics.length === 0 ? (
        <Card className="py-14 text-center text-sm text-muted-foreground">
          {tr("该时间窗口内暂无历史资源监控记录", "No historical resource metrics in this time window")}
        </Card>
      ) : (
        /* Tab 1: Resources 2-Column Vibe Grid */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Chart 1: CPU Usage + Peak Band */}
          <ChartCard
            title={tr("CPU 负载趋势", "CPU Usage")}
            subtitle={tr(
              "实线为桶内均值，浅色虚线带为采样峰值",
              "Solid line shows bucket average; dashed band shows peak (cpu_max)",
            )}
            badge={
              peak ? (
                <Badge variant="blue" className="tnum">
                  {tr("窗口峰值", "Peak")} {peak.cpu.toFixed(1)}%
                </Badge>
              ) : undefined
            }
          >
            <ResponsiveContainer>
              <ComposedChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(chartRows)} />
                <YAxis {...axes.cpu} unit="%" {...VALUE_AXIS} />
                <Tooltip
                  {...TOOLTIP}
                  formatter={(_, __, item) => {
                    const mean = Number(item?.payload?.cpu ?? 0)
                    const hi = item?.payload?.cpu_max
                    return [
                      hi !== undefined
                        ? `${tr("均值", "Avg")} ${mean.toFixed(1)}% · ${tr("峰值", "Peak")} ${Number(hi).toFixed(1)}%`
                        : `${mean.toFixed(1)}%`,
                      "CPU",
                    ]
                  }}
                />
                <Area
                  dataKey="cpu_band"
                  stroke="var(--vibe-cyan)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  fill="var(--vibe-cyan)"
                  fillOpacity={0.14}
                  isAnimationActive={false}
                  tooltipType="none"
                  legendType="none"
                />
                <Area
                  dataKey="cpu"
                  name="CPU"
                  stroke="var(--vibe-blue)"
                  fill="var(--vibe-blue)"
                  fillOpacity={0.16}
                  {...RESOURCE_SERIES}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 2: Memory & Swap Usage */}
          <ChartCard
            title={tr(
              `内存与 Swap (${bytes(node.mem_total)})`,
              `Memory & Swap (${bytes(node.mem_total)})`,
            )}
            subtitle={tr(
              "坐标轴上限为物理内存总量",
              "Y-axis scaled to total physical RAM capacity",
            )}
            badge={
              m ? (
                <Badge variant="blue" className="tnum">
                  {tr("当前", "Now")} {bytes(m.mem_used)}
                </Badge>
              ) : undefined
            }
          >
            <ResponsiveContainer>
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(chartRows)} />
                <YAxis
                  domain={[0, node.mem_total]}
                  ticks={quarters(node.mem_total)}
                  tickFormatter={axisBytes}
                  {...VALUE_AXIS}
                />
                <Tooltip {...TOOLTIP} formatter={(v, name) => [bytes(Number(v)), name]} />
                <Area
                  dataKey="mem_used"
                  name={tr("物理内存", "RAM")}
                  stroke="var(--vibe-cyan)"
                  fill="var(--vibe-cyan)"
                  fillOpacity={0.18}
                  {...RESOURCE_SERIES}
                />
                {node.swap_total > 0 && (
                  <Area
                    dataKey="swap_used"
                    name="Swap"
                    stroke="var(--chart-4)"
                    fill="var(--chart-4)"
                    fillOpacity={0.12}
                    {...RESOURCE_SERIES}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 3: Logarithmic Network Throughput */}
          <ChartCard
            title={tr(
              "网络吞吐 (对数坐标)",
              "Network Throughput (Log Scale)",
            )}
            subtitle={tr(
              "对数坐标兼顾日常轻载与突发测速峰值",
              "Logarithmic scale preserves both baseline traffic and burst peaks",
            )}
            badge={
              peak ? (
                <Badge variant="emerald" className="tnum">
                  {tr("峰值", "Peak")} ↓ {rate(peak.rx)} · ↑ {rate(peak.tx)}
                </Badge>
              ) : undefined
            }
          >
            <ResponsiveContainer>
              <ComposedChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(chartRows)} />
                <YAxis scale="log" {...axes.rate} tickFormatter={axisBytes} unit="/s" {...VALUE_AXIS} />
                <Tooltip
                  {...TOOLTIP}
                  formatter={(_, name, item) => {
                    const mean = item?.payload?.[`net_${item.dataKey}`]
                    const top = item?.payload?.[`net_${item.dataKey}_max`]
                    return [
                      top === undefined
                        ? rate(mean)
                        : `${tr("均值", "Avg")} ${rate(mean)} · ${tr("峰值", "Peak")} ${rate(top)}`,
                      name,
                    ]
                  }}
                />
                {[
                  { key: "rx", stroke: "var(--vibe-blue)" },
                  { key: "tx", stroke: "var(--vibe-teal)" },
                ].map((s) => (
                  <Area
                    key={s.key}
                    dataKey={`${s.key}_band`}
                    stroke={s.stroke}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    fill={s.stroke}
                    fillOpacity={0.15}
                    isAnimationActive={false}
                    tooltipType="none"
                    legendType="none"
                  />
                ))}
                <Line dataKey="rx" name={tr("下行 (Rx)", "Inbound (Rx)")} stroke="var(--vibe-blue)" {...RESOURCE_SERIES} />
                <Line dataKey="tx" name={tr("上行 (Tx)", "Outbound (Tx)")} stroke="var(--vibe-teal)" {...RESOURCE_SERIES} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 4: Disk Usage */}
          <ChartCard
            title={tr(
              `硬盘占用 (${bytes(node.disk_total)})`,
              `Disk Storage (${bytes(node.disk_total)})`,
            )}
            subtitle={tr(
              "基于节点挂载主分区总容量的使用轨迹",
              "Storage utilization across total primary disk capacity",
            )}
            badge={
              m ? (
                <Badge variant="outline" className="tnum">
                  {tr("已用", "Used")} {bytes(m.disk_used)}
                </Badge>
              ) : undefined
            }
          >
            <ResponsiveContainer>
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(chartRows)} />
                <YAxis
                  domain={[0, node.disk_total]}
                  ticks={quarters(node.disk_total)}
                  tickFormatter={axisBytes}
                  {...VALUE_AXIS}
                />
                <Tooltip {...TOOLTIP} formatter={(v) => [bytes(Number(v)), tr("硬盘已用", "Disk Used")]} />
                <Area
                  dataKey="disk_used"
                  name={tr("硬盘", "Disk")}
                  stroke="var(--vibe-teal)"
                  fill="var(--vibe-teal)"
                  fillOpacity={0.18}
                  {...RESOURCE_SERIES}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Chart 5: Historical TCP / UDP / Processes (Hub 1.4.0+) */}
          {hasConnHistory && (
            <div className="lg:col-span-2">
              <ChartCard
                title={tr(
                  "连接与进程趋势 (TCP / UDP)",
                  "Connections & Processes (TCP / UDP / Procs)",
                )}
                subtitle={tr(
                  "历史 TCP 连接数、UDP 套接字数与系统进程数曲线",
                  "Historical TCP connections, UDP sockets, and running processes",
                )}
                badge={
                  m ? (
                    <Badge variant="outline" className="tnum">
                      <Layers className="mr-1 size-3" /> TCP {m.tcp} · UDP {m.udp} · {m.procs}{" "}
                      {tr("进程", "procs")}
                    </Badge>
                  ) : undefined
                }
              >
                <ResponsiveContainer>
                  <ComposedChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis {...timeAxis(chartRows)} />
                    <YAxis {...VALUE_AXIS} />
                    <Tooltip {...TOOLTIP} />
                    <Line dataKey="tcp" name="TCP" stroke="var(--vibe-blue)" {...RESOURCE_SERIES} />
                    <Line dataKey="udp" name="UDP" stroke="var(--vibe-cyan)" {...RESOURCE_SERIES} />
                    <Line dataKey="procs" name={tr("进程数", "Procs")} stroke="var(--vibe-teal)" {...RESOURCE_SERIES} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
