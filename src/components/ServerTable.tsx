import { useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Country, deployed, Expiry, OsIcon } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import {
  bytes,
  cpuName,
  cycle,
  FOREVER,
  money,
  monthUsage,
  osName,
  pair,
  percent,
  rate,
  sinceSeen,
  trafficModeLabel,
  uptime,
} from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function MiniBar({ pct, label, tone = "blue" }: { pct: number | null; label: string; tone?: "blue" | "cyan" | "teal" }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
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
    <div className="min-w-[84px]">
      <div className="tnum flex items-center justify-between text-[11px]">
        <span className="font-medium text-foreground">{pct === null ? "—" : `${v.toFixed(0)}%`}</span>
        <span className="truncate text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

function TableRowItem({
  node,
  showBilling,
  onOpen,
}: {
  node: Node
  showBilling: boolean
  onOpen: (id: number) => void
}) {
  const { lang, tr } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const m = node.online ? node.metrics : null
  const down = sinceSeen(node)
  const usedTraffic = monthUsage(node)
  const trafficPct = node.traffic_limit > 0 ? percent(usedTraffic, node.traffic_limit) : null

  return (
    <>
      <tr
        className="group cursor-pointer border-t border-border/80 transition-colors hover:bg-card-subtle"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-3 py-3 text-left">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={tr("展开节点详情", "Expand node details")}
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                node.online ? "bg-emerald-500" : deployed(node) ? "bg-rose-500" : "bg-slate-400",
              )}
            />
            <Country node={node} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="max-w-[180px] truncate font-semibold text-foreground">{node.name}</span>
                {node.group && (
                  <span className="hidden rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                    {node.group}
                  </span>
                )}
              </div>
              {node.public_remark && (
                <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">{node.public_remark}</div>
              )}
            </div>
          </div>
        </td>

        <td className="hidden px-3 py-3 text-left lg:table-cell">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <OsIcon os={node.os} />
            <span className="max-w-[120px] truncate">{osName(node.os) || "—"}</span>
          </span>
        </td>

        <td className="tnum hidden px-3 py-3 text-left text-xs text-muted-foreground md:table-cell">
          {node.online
            ? m
              ? uptime(m.uptime, lang)
              : tr("连接中", "Connecting")
            : deployed(node)
              ? `${tr("离线", "Offline")} ${uptime(down, lang)}`
              : tr("未接入", "Pending")}
        </td>

        <td className="px-3 py-3">
          <div className="tnum space-y-0.5 text-left text-xs">
            <div className="inline-flex items-center gap-1 font-medium text-foreground">
              <ArrowDown className="size-3 text-[var(--vibe-blue)]" />
              {m ? rate(m.net_rx) : "—"}
            </div>
            <div className=" flex items-center gap-1 text-[11px] text-muted-foreground">
              <ArrowUp className="size-3 text-[var(--vibe-cyan)]" />
              {m ? rate(m.net_tx) : "—"}
            </div>
          </div>
        </td>

        <td className="px-3 py-3">
          <MiniBar
            pct={m ? m.cpu : null}
            label={tr(`${node.cpu_cores} 核`, `${node.cpu_cores}C`)}
            tone="blue"
          />
        </td>

        <td className="hidden px-3 py-3 sm:table-cell">
          <MiniBar
            pct={m ? percent(m.mem_used, m.mem_total) : null}
            label={bytes(node.mem_total, 0)}
            tone="cyan"
          />
        </td>

        <td className="hidden px-3 py-3 xl:table-cell">
          <MiniBar
            pct={m ? percent(m.disk_used, m.disk_total) : null}
            label={bytes(node.disk_total, 0)}
            tone="teal"
          />
        </td>

        <td className="hidden px-3 py-3 md:table-cell">
          <MiniBar
            pct={trafficPct}
            label={node.traffic_limit > 0 ? bytes(node.traffic_limit, 0) : FOREVER}
            tone="blue"
          />
        </td>

        {showBilling && (
          <td className="hidden px-3 py-3 text-right lg:table-cell">
            <div className="flex flex-col items-end gap-0.5">
              {node.price > 0 && (
                <span className="tnum text-xs font-medium text-foreground">
                  {money(node.price, node.currency)} / {cycle(node.billing_cycle, lang)}
                </span>
              )}
              <Expiry node={node} />
            </div>
          </td>
        )}

        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(node.id)
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            {tr("详情", "Details")} <ArrowUpRight className="size-3.5" />
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-card-subtle/70">
          <td colSpan={showBilling ? 10 : 9} className="px-4 py-3.5">
            {deployed(node) ? (
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 rounded-xl bg-card p-3">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {tr("硬件与内核", "Hardware & Kernel")}
                  </div>
                  <div className="font-medium">
                    {node.cpu_name ? cpuName(node.cpu_name) : tr(`${node.cpu_cores} 核处理器`, `${node.cpu_cores}-Core CPU`)}
                  </div>
                  <div className="text-muted-foreground">
                    {[osName(node.os), node.kernel, node.arch, node.virt !== "none" ? node.virt : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>

                <div className="space-y-1 rounded-xl bg-card p-3">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {tr("存储与交换分区", "Memory & Storage")}
                  </div>
                  <div className="tnum font-medium">
                    {tr("内存：", "RAM: ")}
                    {m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
                  </div>
                  <div className="tnum text-muted-foreground">
                    Swap: {node.swap_total > 0 ? (m ? pair(m.swap_used, m.swap_total) : bytes(node.swap_total)) : tr("未启用", "Off")} · {tr("硬盘：", "Disk: ")}
                    {m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
                  </div>
                </div>

                <div className="space-y-1 rounded-xl bg-card p-3">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {tr("连接数与累计流量", "Connections & Traffic")}
                  </div>
                  <div className="tnum font-medium">
                    {m
                      ? `${tr("负载", "Load")} ${m.load.map((l) => l.toFixed(2)).join(" / ")} · ${m.procs} ${tr("进程", "procs")}`
                      : tr("当前离线", "Currently Offline")}
                  </div>
                  <div className="tnum text-muted-foreground">
                    {tr("今日", "Today")} ↓ {bytes(node.day_rx)} ↑ {bytes(node.day_tx)} · {tr("总计", "Total")} ↓ {bytes(node.total_rx)} ↑ {bytes(node.total_tx)}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl bg-card p-3">
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {tr("计费规则与历史图表", "Billing Rule & Charts")}
                    </div>
                    <div className="tnum mt-0.5 text-muted-foreground">
                      {tr("流量计费：", "Mode: ")}
                      {trafficModeLabel(node.traffic_mode, lang)}
                      {node.traffic_reset_day > 0
                        ? tr(` · 每月 ${node.traffic_reset_day} 日重置`, ` · Resets Day ${node.traffic_reset_day}`)
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpen(node.id)}
                    className="mt-2 inline-flex w-fit cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    {tr("打开完整历史趋势与延迟监控", "Open Full History & Latency Charts")} <ArrowUpRight className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {tr("该节点尚未上报硬件与实时监控指标。", "No hardware or live metrics reported for this node yet.")}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function ServerTable({
  nodes,
  showBilling = true,
  onOpen,
}: {
  nodes: Node[]
  showBilling?: boolean
  onOpen: (id: number) => void
}) {
  const { tr } = useI18n()
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {tr("节点明细", "Server Inventory")}
          </h3>
          <Badge variant="blue" className="tnum text-[11px]">
            {nodes.filter((n) => n.online).length} / {nodes.length} {tr("在线", "Online")}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {tr(
            "点击任意行可展开硬件与连接详情，点击「详情」查看历史曲线",
            "Click any row to expand hardware & traffic specs, or click Details for historical charts",
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-t border-border bg-card-subtle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 text-left">{tr("节点名称 / 区域", "Node / Region")}</th>
              <th className="hidden px-3 py-2.5 text-left lg:table-cell">{tr("操作系统", "OS")}</th>
              <th className="hidden px-3 py-2.5 text-left md:table-cell">{tr("在线时长", "Uptime")}</th>
              <th className="px-3 py-2.5 text-left">{tr("实时网速", "Throughput")}</th>
              <th className="px-3 py-2.5 text-left">CPU</th>
              <th className="hidden px-3 py-2.5 text-left sm:table-cell">{tr("内存", "RAM")}</th>
              <th className="hidden px-3 py-2.5 text-left xl:table-cell">{tr("硬盘", "Disk")}</th>
              <th className="hidden px-3 py-2.5 text-left md:table-cell">{tr("月度流量", "Traffic")}</th>
              {showBilling && (
                <th className="hidden px-3 py-2.5 text-right lg:table-cell">{tr("价格 / 到期", "Price / Expiry")}</th>
              )}
              <th className="px-3 py-2.5 text-right">{tr("操作", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <TableRowItem key={n.id} node={n} showBilling={showBilling} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
