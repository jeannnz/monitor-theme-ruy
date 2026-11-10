import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import {
  Bell,
  Coins,
  LayoutGrid,
  LayoutList,
  Moon,
  Rows3,
  Search,
  SlidersHorizontal,
  Sun,
  Wrench,
} from "lucide-react"

import { BillingView } from "@/components/BillingView"
import { NodeCard, NodeCompactCard } from "@/components/NodeCard"
import { ServerTable } from "@/components/ServerTable"
import { SettingsDrawer } from "@/components/SettingsDrawer"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, groupsOf, useNodes } from "@/lib/api"
import { defaultConfig, loadConfig, type ThemeConfig } from "@/lib/config"
import { expiresIn, monthUsage, percent } from "@/lib/format"
import { I18nProvider, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Me = {
  authed: boolean
  github: boolean
  site_name: string
  public_page: boolean
  history_days?: number
}

type StatusFilter = "all" | "online" | "offline" | "busy" | "expiring"
type SortKey = "default" | "cpu" | "mem" | "disk" | "speed" | "traffic" | "expiry"
type ViewMode = "grid" | "compact" | "table" | "billing"

const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    (next: number | null) => {
      const path = next === null ? "/" : `/node/${next}`
      if (location.pathname !== path) history.pushState({}, "", path)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

function useTheme(siteDefault: "system" | "light" | "dark") {
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem("theme")
    } catch {
      return null
    }
  })
  const system = useSyncExternalStore(
    (notify) => {
      DARK_MEDIA.addEventListener("change", notify)
      return () => DARK_MEDIA.removeEventListener("change", notify)
    },
    () => DARK_MEDIA.matches,
  )
  const dark = saved
    ? saved === "dark"
    : siteDefault === "dark"
      ? true
      : siteDefault === "light"
        ? false
        : system

  useEffect(() => {
    const hold = document.createElement("style")
    hold.textContent = "*,*::before,*::after{transition:none!important}"
    document.head.append(hold)
    document.documentElement.classList.toggle("dark", dark)
    void document.body.offsetWidth
    hold.remove()
  }, [dark])

  return [
    dark,
    () => {
      const next = dark ? "light" : "dark"
      try {
        localStorage.setItem("theme", next)
      } catch {
        // Ignore storage errors
      }
      setSaved(next)
    },
  ] as const
}

export default function App() {
  const [config, setConfig] = useState<ThemeConfig>(defaultConfig)
  const [configLoaded, setConfigLoaded] = useState(false)

  useEffect(() => {
    void loadConfig().then((cfg) => {
      setConfig(cfg)
      setConfigLoaded(true)
    })
  }, [])

  return (
    <I18nProvider defaultLanguage={config.language}>
      <DashboardApp
        config={config}
        setConfig={setConfig}
        configLoaded={configLoaded}
      />
    </I18nProvider>
  )
}

function DashboardApp({
  config,
  setConfig,
  configLoaded,
}: {
  config: ThemeConfig
  setConfig: (next: ThemeConfig) => void
  configLoaded: boolean
}) {
  const { isEn, toggleLang, tr } = useI18n()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const [dark, toggleTheme] = useTheme(config.default_theme)
  const { nodes, error, closed } = useNodes()
  const [openNodeId, goNode] = useNodeRoute()

  // Workspace UI States
  const [group, setGroup] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortBy, setSortBy] = useState<SortKey>("default")
  const [viewModeOverride, setViewModeOverride] = useState<ViewMode | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const viewMode: ViewMode = viewModeOverride ?? config.default_view

  // Apply accent color attribute to root
  useEffect(() => {
    document.documentElement.dataset.accent = config.accent_color || "blue"
  }, [config.accent_color])

  const loadMe = useCallback(() => {
    return api<Me>("/me")
      .then((next) => {
        setMe(next)
        setMeError("")
      })
      .catch((e: Error) => setMeError(e.message))
  }, [])

  useEffect(() => {
    loadMe()
    void loadDetail()
  }, [loadMe])

  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const sortedNodes = useMemo(
    () => [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [nodes],
  )
  const selectedNode = sortedNodes.find((n) => n.id === openNodeId)

  // Group tabs in exact operator node order
  const groups = useMemo(() => groupsOf(sortedNodes), [sortedNodes])
  const ungroupedCount = useMemo(
    () => sortedNodes.filter((n) => !n.group).length,
    [sortedNodes],
  )
  const currentGroup =
    group === null || (group === "" ? ungroupedCount > 0 : groups.includes(group))
      ? group
      : null

  useEffect(() => {
    if (currentGroup !== group) setGroup(currentGroup)
  }, [currentGroup, group])

  // Nodes within the active group tab (Summary & KPIs follow this exact slice!)
  const groupNodes = useMemo(
    () =>
      currentGroup === null
        ? sortedNodes
        : sortedNodes.filter((n) => (n.group ?? "") === currentGroup),
    [sortedNodes, currentGroup],
  )

  // Further filtered & sorted nodes for the Node List / Table
  const displayedNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = groupNodes.filter((n) => {
      if (q) {
        const hay = [
          n.name,
          n.group ?? "",
          n.country,
          n.os,
          n.cpu_name,
          n.public_remark ?? "",
          n.remark ?? "",
          n.ip ?? "",
        ]
          .join(" ")
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (statusFilter === "online") return n.online
      if (statusFilter === "offline") return !n.online
      if (statusFilter === "busy") {
        if (!n.online || !n.metrics) return false
        return (
          n.metrics.cpu >= 75 ||
          percent(n.metrics.mem_used, n.metrics.mem_total) >= 85 ||
          percent(n.metrics.disk_used, n.metrics.disk_total) >= 85
        )
      }
      if (statusFilter === "expiring") {
        const d = expiresIn(n)
        return d !== null && d <= 7
      }
      return true
    })

    if (sortBy === "default") return filtered
    return [...filtered].sort((a, b) => {
      if (sortBy === "cpu") {
        return (b.online && b.metrics ? b.metrics.cpu : -1) - (a.online && a.metrics ? a.metrics.cpu : -1)
      }
      if (sortBy === "mem") {
        return (
          (b.online && b.metrics ? percent(b.metrics.mem_used, b.metrics.mem_total) : -1) -
          (a.online && a.metrics ? percent(a.metrics.mem_used, a.metrics.mem_total) : -1)
        )
      }
      if (sortBy === "disk") {
        return (
          (b.online && b.metrics ? percent(b.metrics.disk_used, b.metrics.disk_total) : -1) -
          (a.online && a.metrics ? percent(a.metrics.disk_used, a.metrics.disk_total) : -1)
        )
      }
      if (sortBy === "speed") {
        const sa = a.online && a.metrics ? a.metrics.net_rx + a.metrics.net_tx : -1
        const sb = b.online && b.metrics ? b.metrics.net_rx + b.metrics.net_tx : -1
        return sb - sa
      }
      if (sortBy === "traffic") {
        return monthUsage(b) - monthUsage(a)
      }
      if (sortBy === "expiry") {
        const da = expiresIn(a) ?? 999999
        const db = expiresIn(b) ?? 999999
        return da - db
      }
      return 0
    })
  }, [groupNodes, search, statusFilter, sortBy])

  const siteName = me?.site_name || "Monitor"

  useEffect(() => {
    document.title = [selectedNode?.name, siteName].filter(Boolean).join(" · ")
  }, [selectedNode?.name, siteName])

  if (!me) {
    return (
      <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
        {meError ? (
          <div className="space-y-3 text-center">
            <p role="alert">
              {tr("加载失败：", "Failed to load: ")}
              {meError}
            </p>
            <Button onClick={loadMe}>{tr("重试", "Retry")}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 animate-ping rounded-full bg-[var(--vibe-blue)]" />
            <span>{tr("正在加载监控看板…", "Loading dashboard…")}</span>
          </div>
        )}
      </div>
    )
  }

  if (!me.public_page && !me.authed) return null

  const groupTabs = [
    [null, tr("全部节点", "All Nodes"), sortedNodes.length] as const,
    ...groups.map((g) => [g, g, sortedNodes.filter((n) => n.group === g).length] as const),
    ...(ungroupedCount ? [["", tr("未分组", "Ungrouped"), ungroupedCount] as const] : []),
  ]

  const gridColsClass =
    config.columns === 2
      ? "sm:grid-cols-2"
      : config.columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3"

  return (
    <div className="flex min-h-svh flex-col">
      {/* Main Full-Bleed Workspace Container (No Left Menu, No Top Header Bar) */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* Site Notice Banner */}
        {config.notice && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/25 bg-accent px-4 py-3 text-xs text-accent-foreground">
            <Bell className="mt-0.5 size-4 shrink-0 text-[var(--vibe-blue)]" />
            <p className="leading-relaxed whitespace-pre-wrap">{config.notice}</p>
          </div>
        )}

        {/* Live Stream / Network Error Alert */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {openNodeId !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selectedNode ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail
                node={selectedNode}
                nodes={sortedNodes}
                historyDays={me.history_days ?? 7}
                showBilling={config.show_billing}
                onBack={() => goNode(null)}
                onSelectNode={(id) => goNode(id)}
              />
            </Suspense>
          ) : (
            <div className="vibe-card py-16 text-center text-sm text-muted-foreground">
              {tr("节点不存在或未公开。", "Node not found or not public.")}{" "}
              <button className="font-medium text-primary underline" onClick={() => goNode(null)}>
                {tr("返回看板首页", "Back to Dashboard")}
              </button>
            </div>
          )
        ) : !nodes || !configLoaded ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Group Tabs Row (when operator configured groups) */}
            {groups.length > 0 && (
              <div
                role="group"
                aria-label={tr("节点分组", "Node Groups")}
                className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
              >
                {groupTabs.map(([value, label, count]) => (
                  <Button
                    key={value === null ? "*" : `=${value}`}
                    aria-pressed={currentGroup === value}
                    size="sm"
                    variant={currentGroup === value ? "default" : "outline"}
                    className="shrink-0 rounded-xl"
                    onClick={() => setGroup(value)}
                  >
                    {label}
                    <span
                      className={cn(
                        "tnum rounded-full px-1.5 py-0.2 text-[11px]",
                        currentGroup === value
                          ? "bg-white/20 text-primary-foreground"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {/* Vibe KPI Cards + 3-Column Visual Analytics Bento */}
            <Summary
              nodes={groupNodes}
              group={currentGroup}
              showKpi={config.show_kpi}
              showAnalytics={config.show_analytics}
              mapStyle={config.map_style}
              onSelectNode={goNode}
            />

            {/* Server Fleet Toolbar & List */}
            <section className="space-y-3.5">
              {/* Unified Toolbar: Status Filter Pills + Search + Sort + View Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["all", tr("全部", "All"), groupNodes.length],
                      ["online", tr("在线", "Online"), groupNodes.filter((n) => n.online).length],
                      ["offline", tr("离线", "Offline"), groupNodes.filter((n) => !n.online).length],
                      [
                        "busy",
                        tr("高负载", "High Load"),
                        groupNodes.filter(
                          (n) =>
                            n.online &&
                            n.metrics &&
                            (n.metrics.cpu >= 75 ||
                              percent(n.metrics.mem_used, n.metrics.mem_total) >= 85 ||
                              percent(n.metrics.disk_used, n.metrics.disk_total) >= 85),
                        ).length,
                      ],
                      [
                        "expiring",
                        tr("临期", "Expiring"),
                        groupNodes.filter((n) => {
                          const d = expiresIn(n)
                          return d !== null && d <= 7
                        }).length,
                      ],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                        statusFilter === key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/70 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>{label}</span>
                      <span className="tnum opacity-80">{count}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Inline Search Input */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={tr(
                        "搜索节点、地区、系统、备注…",
                        "Search node, region, OS, remarks…",
                      )}
                      className="h-8 w-44 rounded-lg border border-border bg-card-subtle pr-2.5 pl-8 text-xs text-foreground outline-none transition-colors focus:border-ring focus:bg-card sm:w-56"
                    />
                  </div>

                  {/* Sort Selector */}
                  {viewMode !== "billing" && (
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      aria-label={tr("排序方式", "Sort order")}
                      className="h-8 rounded-lg border border-border bg-card-subtle px-2.5 text-xs font-medium text-foreground outline-none focus:border-ring"
                    >
                      <option value="default">{tr("排序：默认顺序", "Sort: Default")}</option>
                      <option value="cpu">{tr("排序：CPU 占用 ↓", "Sort: CPU Load ↓")}</option>
                      <option value="mem">{tr("排序：内存占用 ↓", "Sort: Memory ↓")}</option>
                      <option value="disk">{tr("排序：硬盘占用 ↓", "Sort: Disk ↓")}</option>
                      <option value="speed">{tr("排序：实时网速 ↓", "Sort: Speed ↓")}</option>
                      <option value="traffic">{tr("排序：月流量 ↓", "Sort: Traffic ↓")}</option>
                      <option value="expiry">{tr("排序：到期时间 ↑", "Sort: Expiry ↑")}</option>
                    </select>
                  )}

                  {/* View Mode Switcher */}
                  <div className="inline-flex rounded-lg bg-secondary p-0.5">
                    {(
                      [
                        ["grid", tr("卡片", "Cards"), LayoutGrid],
                        ["compact", tr("紧凑", "Compact"), Rows3],
                        ["table", tr("表格", "Table"), LayoutList],
                        ...(config.show_billing
                          ? ([["billing", tr("账单", "Billing"), Coins]] as const)
                          : []),
                      ] as const
                    ).map(([mode, label, Icon]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewModeOverride(mode)}
                        title={tr(`${label}视图`, `${label} view`)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          viewMode === mode
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                        <span className="hidden md:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Nodes / Billing Render */}
              {viewMode === "billing" ? (
                <BillingView nodes={displayedNodes} onSelectNode={goNode} />
              ) : sortedNodes.length === 0 ? (
                <div className="vibe-card py-16 text-center text-sm text-muted-foreground">
                  {tr("还没有添加任何服务器节点", "No server nodes have been added yet")}
                </div>
              ) : displayedNodes.length === 0 ? (
                <div className="vibe-card py-14 text-center text-sm text-muted-foreground">
                  {tr("没有匹配的节点。", "No matching nodes found.")}{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline"
                    onClick={() => {
                      setSearch("")
                      setStatusFilter("all")
                    }}
                  >
                    {tr("重置筛选条件", "Reset filters")}
                  </button>
                </div>
              ) : viewMode === "table" ? (
                <ServerTable
                  nodes={displayedNodes}
                  showBilling={config.show_billing}
                  onOpen={goNode}
                />
              ) : viewMode === "compact" ? (
                <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {displayedNodes.map((n) => (
                    <NodeCompactCard
                      key={n.id}
                      node={n}
                      showBilling={config.show_billing}
                      onOpen={() => goNode(n.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className={cn("grid items-start gap-4", gridColsClass)}>
                  {displayedNodes.map((n) => (
                    <NodeCard
                      key={n.id}
                      node={n}
                      showSparkline={config.show_sparkline}
                      showBilling={config.show_billing}
                      onOpen={() => goNode(n.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <span>
            {siteName}
            {config.subtitle ? ` · ${config.subtitle}` : ""}
            {config.footer_text ? ` · ${config.footer_text}` : ""}
          </span>
          <span>
            Theme{" "}
            <a
              href="https://github.com/jeannnz/monitor-theme-vibe"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground hover:text-primary"
            >
              Vibe
            </a>{" "}
            · Powered by{" "}
            <a
              href="https://github.com/monitor-probe/monitor"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground hover:text-primary"
            >
              Monitor
            </a>
          </span>
        </div>
      </footer>

      {/* Right-Edge Bottom-Docked Floating Control Capsule (吸附在屏幕右侧边缘靠下方) */}
      <div
        role="toolbar"
        aria-label={tr("快捷工具栏", "Quick Toolbar")}
        className="fixed right-0 bottom-16 z-40 flex flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 border-border/90 bg-card/92 p-1.5 shadow-xl backdrop-blur-md"
      >
        <button
          type="button"
          onClick={toggleLang}
          title={tr("切换为英文", "Switch to Chinese")}
          aria-label={tr("切换中英文语言", "Switch language")}
          className="group relative flex size-9 cursor-pointer items-center justify-center rounded-xl text-[11px] font-bold tracking-tight text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span className="rounded-md border border-border/80 bg-card-subtle px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--vibe-blue)]">
            {isEn ? "中" : "EN"}
          </span>
          <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md group-hover:block dark:bg-slate-800">
            {tr("切换英文", "中文界面")}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={
            dark
              ? tr("切换为浅色模式", "Switch to Light Mode")
              : tr("切换为深色模式", "Switch to Dark Mode")
          }
          aria-label={tr("切换浅色或深色模式", "Toggle light or dark mode")}
          className="group relative flex size-9 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {dark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
          <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md group-hover:block dark:bg-slate-800">
            {dark ? tr("浅色模式", "Light Mode") : tr("深色模式", "Dark Mode")}
          </span>
        </button>

        {me.authed && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={tr("看板设置", "Dashboard Settings")}
            aria-label={tr("打开看板设置", "Open dashboard settings")}
            className="group relative flex size-9 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <SlidersHorizontal className="size-4 text-[var(--vibe-blue)]" />
            <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md group-hover:block dark:bg-slate-800">
              {tr("看板设置", "Settings")}
            </span>
          </button>
        )}

        <div className="h-px w-5 bg-border/80" />

        <a
          href="/admin/"
          title={
            me.authed
              ? tr("进入管理后台", "Open Admin Console")
              : tr("管理员登录", "Admin Login")
          }
          aria-label={
            me.authed
              ? tr("进入管理后台", "Open Admin Console")
              : tr("管理员登录", "Admin Login")
          }
          className="group relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Wrench className="size-4" />
          <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md group-hover:block dark:bg-slate-800">
            {me.authed ? tr("进入后台", "Admin Console") : tr("后台登录", "Admin Login")}
          </span>
        </a>
      </div>

      {/* Admin-Only Live Theme Settings Drawer */}
      {me.authed && (
        <SettingsDrawer
          open={settingsOpen}
          authed={me.authed}
          config={config}
          onChange={setConfig}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

