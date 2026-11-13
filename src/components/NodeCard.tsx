import type { CSSProperties } from "react"
import { ArrowDown, ArrowUp, ArrowUpRight, Cpu, Layers, MessageSquareText, Lock, Radio } from "lucide-react"
import {
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
  siLinux,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu,
  type SimpleIcon,
} from "simple-icons"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/Meter"
import { PING_PROBE_COLORS, VibePingSparkline, VibeSparkline } from "@/components/VibeCharts"
import { nodeSpeedHistory, type Node, type NodePingSummary } from "@/lib/api"
import {
  bytes,
  cpuName,
  cycle,
  expiresIn,
  FOREVER,
  money,
  monthUsage,
  osName,
  pair,
  percent,
  rate,
  sinceSeen,
  uptime,
} from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const FLAGS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/node_modules/country-flag-icons/3x2/*.svg", {
      query: "?url",
      import: "default",
      eager: true,
    }),
  ).map(([path, url]) => [path.match(/([\w-]+)\.svg$/)![1], url]),
)

const DISTROS: [string, SimpleIcon][] = [
  ["debian", siDebian],
  ["raspbian", siDebian],
  ["ubuntu", siUbuntu],
  ["alpine", siAlpinelinux],
  ["centos", siCentos],
  ["rocky", siRockylinux],
  ["almalinux", siAlmalinux],
  ["red hat", siRedhat],
  ["fedora", siFedora],
  ["arch", siArchlinux],
  ["opensuse", siOpensuse],
]

export function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

export function Status({ node }: { node: Node }) {
  const { lang, tr } = useI18n()
  const down = sinceSeen(node)
  const isOnline = node.online
  const isDeployed = deployed(node)
  const label = isOnline
    ? `${tr("在线", "Online")} ${node.metrics ? uptime(node.metrics.uptime, lang) : tr("连接中", "Connecting")}`
    : isDeployed
      ? `${tr("离线", "Offline")} ${down >= 60 ? uptime(down, lang) : tr("刚刚", "Just now")}`
      : tr("未接入", "Pending")

  return (
    <Badge
      variant={isOnline ? "emerald" : isDeployed ? "rose" : "default"}
      className="tnum shrink-0 gap-1.5 font-medium"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isOnline
            ? "animate-pulse bg-emerald-500"
            : isDeployed
              ? "bg-rose-500"
              : "bg-muted-foreground/50",
        )}
      />
      {label.trim()}
    </Badge>
  )
}

export function Country({ node, className }: { node: Pick<Node, "country">; className?: string }) {
  if (!node.country) return null
  const src = FLAGS[node.country.toUpperCase()]
  if (!src) {
    return (
      <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0 text-[10px] font-medium", className)}>
        {node.country}
      </Badge>
    )
  }
  return (
    <img
      src={src}
      alt={node.country}
      title={node.country}
      className={cn("h-3.5 w-5 shrink-0 rounded-[3px] object-cover ring-1 ring-foreground/10", className)}
    />
  )
}

export function OsIcon({ os, className }: { os: string; className?: string }) {
  if (!os) return null
  const name = os.toLowerCase()
  const icon = DISTROS.find(([key]) => name.includes(key))?.[1] ?? siLinux
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      style={{ "--brand": `#${icon.hex}` } as CSSProperties}
      className={cn(
        "size-3.5 shrink-0 fill-(--brand) dark:fill-[color-mix(in_oklab,var(--brand)_65%,white)]",
        className,
      )}
    >
      <title>{osName(os)}</title>
      <path d={icon.path} />
    </svg>
  )
}

function trafficFoot(node: Node) {
  return node.traffic_limit > 0
    ? pair(monthUsage(node), node.traffic_limit)
    : `${bytes(monthUsage(node))} / ${FOREVER}`
}

export function Expiry({ node }: { node: Node }) {
  const { tr } = useI18n()
  const days = expiresIn(node)
  if (days === null) {
    return (
      <span
        className="text-[11px] font-medium text-muted-foreground"
        title={tr("长期有效 / 永不到期", "Permanent / No Expiry")}
      >
        {FOREVER} {tr("长期", "Permanent")}
      </span>
    )
  }
  const tone =
    days < 0
      ? "text-rose-500 font-semibold"
      : days === 0
        ? "text-amber-500 font-semibold"
        : days <= 7
          ? "text-amber-500 font-medium"
          : "text-muted-foreground"
  return (
    <span className={cn("tnum text-[11px]", tone)}>
      {days < 0
        ? tr(`已过期 ${-days} 天`, `Expired ${-days}d ago`)
        : days === 0
          ? tr("今天到期", "Expires today")
          : tr(`${days} 天后到期`, `In ${days}d`)}
    </span>
  )
}

export function PingHealthBadge({
  summary,
  compact = false,
}: {
  summary: NodePingSummary
  compact?: boolean
}) {
  const { tr } = useI18n()
  if (summary.health === "empty") return null

  const { health, medianMs, maxLoss, jitterMs } = summary
  const lossTag = maxLoss >= 1 ? `${Math.round(maxLoss)}%` : maxLoss > 0 ? "<1%" : null

  const cfg =
    health === "critical"
      ? {
          cls: "bg-rose-500/14 text-rose-600 dark:text-rose-300",
          dot: "bg-rose-500",
          text:
            medianMs === null
              ? tr("超时", "Timeout")
              : maxLoss >= 10
                ? `${tr("丢包", "Loss")} ${lossTag}`
                : tr("高延", "High"),
        }
      : health === "jitter"
        ? {
            cls: "bg-amber-500/14 text-amber-600 dark:text-amber-300",
            dot: "bg-amber-500",
            text:
              maxLoss >= 1
                ? `${tr("丢包", "Loss")} ${lossTag}`
                : jitterMs >= 55
                  ? `${tr("波动", "Jitter")} ±${jitterMs}ms`
                  : tr("偏高", "Elevated"),
          }
        : health === "good"
          ? {
              cls: "bg-[var(--vibe-blue)]/12 text-[var(--vibe-blue)]",
              dot: "bg-[var(--vibe-blue)]",
              text: lossTag ? `${tr("正常", "OK")} · ${tr("丢", "L")}${lossTag}` : tr("正常", "Normal"),
            }
          : {
              cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
              dot: "bg-emerald-500",
              text: tr("优良", "Optimal"),
            }

  return (
    <span
      className={cn(
        "tnum inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        compact ? "px-1.5 py-0.2 text-[10px]" : "px-2 py-0.5 text-[10px]",
        cfg.cls,
      )}
    >
      <span className={cn("size-1.5 rounded-full", cfg.dot)} />
      {cfg.text}
    </span>
  )
}

function NodePingStrip({
  summary,
  onOpenLatency,
}: {
  summary: NodePingSummary | undefined
  onOpenLatency?: () => void
}) {
  const { tr } = useI18n()

  // Initial loading state: subtle placeholder keeping card height steady
  if (!summary) {
    return (
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card-subtle/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Radio className="size-3 text-muted-foreground/70" />
          <span>{tr("延迟趋势加载中…", "Loading ping trend…")}</span>
        </span>
        <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  // Empty / unconfigured / failed state: graceful non-intrusive bar
  if (summary.health === "empty" || summary.probes.length === 0) {
    return (
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-card-subtle/50 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Radio className="size-3 text-muted-foreground/60" />
          <span>{tr("延迟探测", "Ping")}</span>
        </span>
        <span className="text-[10px]">
          {summary.error ? tr("暂不可用", "Unavailable") : tr("未配置探测目标", "No probes configured")}
        </span>
      </div>
    )
  }

  const toneBorder =
    summary.health === "critical"
      ? "border-rose-500/35 bg-rose-500/[0.045] hover:border-rose-500/55"
      : summary.health === "jitter"
        ? "border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/50"
        : "border-border/55 bg-card-subtle/75 hover:border-ring/45"

  const iconColor =
    summary.health === "critical"
      ? "text-rose-500"
      : summary.health === "jitter"
        ? "text-amber-500"
        : summary.health === "good"
          ? "text-[var(--vibe-blue)]"
          : "text-emerald-500"

  const shownProbes = summary.probes.slice(0, 3)

  return (
    <div
      role="group"
      aria-label={tr("多线延迟趋势", "Multi-probe latency trend")}
      onClick={(e) => {
        if (onOpenLatency) {
          e.stopPropagation()
          onOpenLatency()
        }
      }}
      className={cn(
        "mt-2.5 rounded-xl border px-3 py-2 transition-colors",
        toneBorder,
      )}
    >
      {/* Top Row: Label + Overall Median & Health Status + Coordinated Sparkline */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Radio className={cn("size-3.5 shrink-0", iconColor)} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {tr("延迟", "Ping")}
          </span>
          <span className="tnum text-xs font-bold text-foreground">
            {summary.medianMs !== null ? `${summary.medianMs} ms` : tr("超时", "Timeout")}
          </span>
          <PingHealthBadge summary={summary} compact />
        </div>

        <div className="w-24 shrink-0">
          <VibePingSparkline
            height={22}
            probes={shownProbes.map((p, i) => ({
              id: p.id,
              values: p.values,
              color:
                p.health === "critical"
                  ? "#f43f5e"
                  : p.health === "jitter"
                    ? "#f59e0b"
                    : PING_PROBE_COLORS[i % PING_PROBE_COLORS.length],
            }))}
          />
        </div>
      </div>

      {/* Bottom Row: Per-Probe Latency & Loss Pills */}
      <div
        className={cn(
          "mt-1.5 grid gap-1.5",
          shownProbes.length === 1
            ? "grid-cols-1"
            : shownProbes.length === 2
              ? "grid-cols-2"
              : "grid-cols-3",
        )}
      >
        {shownProbes.map((p, i) => {
          const dotColor =
            p.health === "critical"
              ? "#f43f5e"
              : p.health === "jitter"
                ? "#f59e0b"
                : PING_PROBE_COLORS[i % PING_PROBE_COLORS.length]
          return (
            <div
              key={p.id}
              title={`${p.name} · ${tr("当前", "Now")} ${p.latest !== null ? `${p.latest}ms` : tr("超时", "Timeout")} · ${tr("中位", "Med")} ${p.median !== null ? `${p.median}ms` : "—"} · ${tr("抖动", "Jitter")} ±${p.jitter}ms · ${tr("丢包", "Loss")} ${p.loss}%`}
              className="flex min-w-0 items-center justify-between gap-1 rounded-lg bg-card/75 px-2 py-1 text-[10px]"
            >
              <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="truncate">{p.name}</span>
              </span>
              <span
                className={cn(
                  "tnum shrink-0 font-semibold",
                  p.health === "critical"
                    ? "text-rose-500"
                    : p.health === "jitter"
                      ? "text-amber-500"
                      : "text-foreground",
                )}
              >
                {p.median !== null ? `${p.median}ms` : tr("超时", "T/O")}
                {p.loss >= 1 && (
                  <span className="ml-0.5 text-[9px] font-normal text-rose-500">
                    ·{Math.round(p.loss)}%
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function NodeCard({
  node,
  showSparkline = true,
  showPing = true,
  pingSummary,
  showBilling = true,
  onOpen,
  onOpenLatency,
}: {
  node: Node
  showSparkline?: boolean
  showPing?: boolean
  pingSummary?: NodePingSummary
  showBilling?: boolean
  onOpen: () => void
  onOpenLatency?: () => void
}) {
  const { lang, tr } = useI18n()
  const m = node.metrics
  const history = nodeSpeedHistory.get(node.id) ?? []

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "group relative min-w-0 cursor-pointer gap-0 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/70",
        !node.online && "opacity-90",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      {/* Card Header: Country + Name + Group + Top-Right Vibe Action Circle */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Country node={node} />
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground" title={node.name}>
              {node.name}
            </h3>
            {node.group && (
              <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {node.group}
              </span>
            )}
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {node.os && <OsIcon os={node.os} />}
            <span className="truncate">
              {node.os
                ? [
                    osName(node.os),
                    node.virt && node.virt !== "none" ? node.virt.toUpperCase() : "",
                    node.arch,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : tr("等待首次上报", "Waiting for first report")}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Status node={node} />
          {/* Signature Vibe top-right circular arrow button */}
          <span
            className="inline-flex size-6 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
            aria-hidden
          >
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>

      {/* Public Remark / Admin Private Remark / CPU Model Line */}
      {(node.public_remark || node.remark || node.cpu_name) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          {node.public_remark && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              <MessageSquareText className="size-3 shrink-0" />
              <span className="truncate">{node.public_remark}</span>
            </span>
          )}
          {node.remark && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-amber-500/12 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-300">
              <Lock className="size-3 shrink-0" />
              <span className="truncate">{node.remark}</span>
            </span>
          )}
          {!node.public_remark && !node.remark && node.cpu_name && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground">
              <Cpu className="size-3 shrink-0" />
              <span className="truncate">{cpuName(node.cpu_name)}</span>
            </span>
          )}
        </div>
      )}

      {deployed(node) ? (
        <>
          {/* 4 Core Vibe Resource Meters */}
          <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl bg-card-subtle p-3">
            <Meter
              label={tr(`CPU · ${node.cpu_cores} 核`, `CPU · ${node.cpu_cores}C`)}
              pct={m ? m.cpu : null}
              tone="blue"
              foot={m ? `${tr("负载", "Load")} ${m.load.map((n) => n.toFixed(2)).join(" / ")}` : "—"}
            />
            <Meter
              label={
                node.swap_total > 0 && m
                  ? `${tr("内存", "RAM")} · Swap ${percent(m.swap_used, m.swap_total).toFixed(0)}%`
                  : tr("内存", "RAM")
              }
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              tone="cyan"
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
            />
            <Meter
              label={tr("硬盘", "Disk")}
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              tone="teal"
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
            />
            <Meter
              label={tr("月度流量", "Traffic")}
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              tone="blue"
              empty={FOREVER}
              foot={trafficFoot(node)}
            />
          </div>

          {/* Live Network Throughput + Optional Sparkline */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <div className="flex items-center gap-3">
                <span className="tnum inline-flex items-center gap-1 font-semibold text-foreground">
                  <ArrowDown className="size-3.5 text-[var(--vibe-blue)]" />
                  {m ? rate(m.net_rx) : "—"}
                </span>
                <span className="tnum inline-flex items-center gap-1 font-semibold text-foreground">
                  <ArrowUp className="size-3.5 text-[var(--vibe-cyan)]" />
                  {m ? rate(m.net_tx) : "—"}
                </span>
              </div>
              <div className="tnum flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>
                  {tr("总", "Total")} ↓ {bytes(node.total_rx)}
                </span>
                <span>↑ {bytes(node.total_tx)}</span>
              </div>
            </div>

            {showSparkline && (
              <div className="w-24 shrink-0">
                <VibeSparkline
                  height={28}
                  series={[
                    { values: history.map((h) => h.rx), color: "var(--vibe-blue)" },
                    { values: history.map((h) => h.tx), color: "var(--vibe-cyan)" },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Configurable Multi-Probe Ping Trend Strip */}
          {showPing && <NodePingStrip summary={pingSummary} onOpenLatency={onOpenLatency} />}

          {/* Card Footer: Connections/Processes + Billing & Expiry */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-[11px]">
            <span className="tnum inline-flex items-center gap-1.5 text-muted-foreground">
              <Layers className="size-3" />
              {m
                ? `TCP ${m.tcp} · UDP ${m.udp} · ${m.procs} ${tr("进程", "procs")}`
                : tr("暂无连接数据", "No connection data")}
            </span>
            {showBilling ? (
              <div className="flex items-center gap-2">
                {node.price > 0 && (
                  <span className="tnum rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
                    {money(node.price, node.currency)} / {cycle(node.billing_cycle, lang)}
                  </span>
                )}
                <Expiry node={node} />
              </div>
            ) : (
              <Expiry node={node} />
            )}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-xl bg-card-subtle p-4 text-xs leading-relaxed text-muted-foreground">
          {tr(
            "尚未收到节点首次上报。请在管理后台复制 Agent 安装命令并在目标服务器执行。",
            "No metrics reported yet. Copy the Agent install command from the admin panel and run it on your server.",
          )}
        </div>
      )}
    </Card>
  )
}

/* ============================================================================
 * High-Density Compact Card View for Large Server Fleets
 * ============================================================================ */
export function NodeCompactCard({
  node,
  showPing = true,
  pingSummary,
  showBilling = true,
  onOpen,
  onOpenLatency,
}: {
  node: Node
  showPing?: boolean
  pingSummary?: NodePingSummary
  showBilling?: boolean
  onOpen: () => void
  onOpenLatency?: () => void
}) {
  const { tr } = useI18n()
  const m = node.metrics
  const cpuPct = m ? m.cpu : 0
  const memPct = m ? percent(m.mem_used, m.mem_total) : 0
  const diskPct = m ? percent(m.disk_used, m.disk_total) : 0
  const trafficPct = node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "group min-w-0 cursor-pointer gap-2.5 p-3.5 transition-all hover:border-ring/70",
        !node.online && "opacity-85",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Country node={node} />
          <span className="truncate text-sm font-semibold">{node.name}</span>
        </div>
        <Status node={node} />
      </div>

      {deployed(node) ? (
        <>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            {[
              { label: "CPU", val: m ? `${cpuPct.toFixed(0)}%` : "—", pct: cpuPct, color: "bg-[var(--vibe-blue)]" },
              { label: tr("内存", "RAM"), val: m ? `${memPct.toFixed(0)}%` : "—", pct: memPct, color: "bg-[var(--vibe-cyan)]" },
              { label: tr("硬盘", "Disk"), val: m ? `${diskPct.toFixed(0)}%` : "—", pct: diskPct, color: "bg-[var(--vibe-teal)]" },
              {
                label: tr("流量", "Quota"),
                val: trafficPct !== null ? `${trafficPct.toFixed(0)}%` : FOREVER,
                pct: trafficPct ?? 0,
                color: "bg-[var(--vibe-blue)]",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-card-subtle px-1.5 py-1.5">
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
                <div className="tnum mt-0.5 font-semibold">{item.val}</div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className={cn("h-full rounded-full", item.pct >= 90 ? "bg-rose-500" : item.color)}
                    style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {showPing && pingSummary && pingSummary.health !== "empty" && (
            <div
              onClick={(e) => {
                if (onOpenLatency) {
                  e.stopPropagation()
                  onOpenLatency()
                }
              }}
              className="flex items-center justify-between gap-2 rounded-lg bg-card-subtle/75 px-2.5 py-1 text-[11px]"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Radio className="size-3 shrink-0 text-[var(--vibe-blue)]" />
                <span className="tnum font-semibold text-foreground">
                  {pingSummary.medianMs !== null ? `${pingSummary.medianMs} ms` : tr("超时", "T/O")}
                </span>
                <PingHealthBadge summary={pingSummary} compact />
              </div>
              <div className="w-16 shrink-0">
                <VibePingSparkline
                  height={16}
                  probes={pingSummary.probes.slice(0, 3).map((p, i) => ({
                    id: p.id,
                    values: p.values,
                    color: PING_PROBE_COLORS[i % PING_PROBE_COLORS.length],
                  }))}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tnum inline-flex items-center gap-2 font-medium text-foreground">
              <span>↓ {m ? rate(m.net_rx) : "—"}</span>
              <span>↑ {m ? rate(m.net_tx) : "—"}</span>
            </span>
            {showBilling && <Expiry node={node} />}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{tr("等待节点首次连接上报…", "Waiting for first agent report…")}</p>
      )}
    </Card>
  )
}

