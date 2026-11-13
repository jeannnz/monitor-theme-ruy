import { useState } from "react"
import { Check, Languages, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  allManifestItems,
  defaultConfig,
  saveConfig,
  type ThemeConfig,
} from "@/lib/config"
import { useI18n } from "@/lib/i18n"

const FIELD_LABELS_EN: Record<string, { label: string; help: string }> = {
  language: {
    label: "Default Language",
    help: "Default UI language for new visitors; visitors can toggle Chinese/English anytime on the right floating bar.",
  },
  subtitle: {
    label: "Site Subtitle",
    help: "Subtitle displayed in the footer branding area.",
  },
  notice: {
    label: "Site Announcement",
    help: "Notification banner displayed at the top of the dashboard (leave empty to hide).",
  },
  accent_color: {
    label: "Vibe Accent Palette",
    help: "Controls the global color token for charts, radial rings, badges, and primary buttons.",
  },
  default_theme: {
    label: "Default Color Mode",
    help: "Initial light/dark mode for visitors; can be toggled anytime from the right-edge bar.",
  },
  default_view: {
    label: "Default Node View",
    help: "Default presentation layout for the server node list.",
  },
  columns: {
    label: "Desktop Grid Columns",
    help: "Number of node cards per row on desktop screens (2–4 columns).",
  },
  show_kpi: {
    label: "Show Top KPI Sparkline Row",
    help: "Display the 4 core KPI cards (Availability, CPU Load, Throughput, Monthly Traffic).",
  },
  show_analytics: {
    label: "Show Vibe Analytics Bento",
    help: "Display the Global Reach 3D Globe/Map, Capacity Tick Ring, and System Health Gauge.",
  },
  map_style: {
    label: "Default Global Reach View",
    help: "Default geographic visualization style for the Global Reach card.",
  },
  show_sparkline: {
    label: "Show Live Speed Sparkline on Cards",
    help: "Draw real-time inbound/outbound throughput sparklines inside each server card.",
  },
  show_ping: {
    label: "Show Node Ping Latency Trend",
    help: "Display multi-probe TCP latency trends, health status, and packet loss in cards and tables.",
  },
  show_billing: {
    label: "Show Price & Renewal Cycle",
    help: "Display node cost, billing cycle, and expiry countdown across cards, table, and billing view.",
  },
  footer_text: {
    label: "Footer Extra Text",
    help: "Additional custom text displayed in the footer (leave empty to hide).",
  },
}

export function SettingsDrawer({
  open,
  authed,
  config,
  onChange,
  onClose,
}: {
  open: boolean
  authed: boolean
  config: ThemeConfig
  onChange: (next: ThemeConfig) => void
  onClose: () => void
}) {
  const { lang, setLang, tr } = useI18n()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  if (!open || !authed) return null

  const updateField = (key: string, value: unknown) => {
    setStatus(null)
    if (key === "language" && (value === "zh" || value === "en")) {
      setLang(value)
    }
    onChange({ ...config, [key]: value })
  }

  const handleSaveToHub = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await saveConfig(config as unknown as Record<string, unknown>)
      setStatus({
        type: "ok",
        text: tr("配置已保存，全站即时生效", "Saved to Hub database for all visitors"),
      })
    } catch (e) {
      setStatus({
        type: "err",
        text:
          e instanceof Error
            ? e.message
            : tr("保存失败，请确认管理员登录状态", "Save failed. Make sure you are signed in as admin."),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setStatus(null)
    onChange(defaultConfig())
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-xs">
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card text-card-foreground shadow-2xl"
        role="dialog"
        aria-label={tr("Vibe 主题设置", "Vibe Theme Settings")}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-[var(--vibe-blue)]" />
            <div>
              <h2 className="text-sm font-semibold">
                {tr("Vibe 看板设置", "Vibe Theme Settings")}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {tr(
                  "管理员专属配置，保存后全站生效",
                  "Admin configuration: preview live and save to Hub",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              title={tr("切换中/英文", "Switch Language")}
            >
              <Languages className="size-3.5" />
              {lang === "zh" ? "EN" : "中文"}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title={tr("关闭", "Close")}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {allManifestItems.map((item, idx) => {
            if (item.type === "title") {
              return (
                <div
                  key={`title-${idx}`}
                  className="border-b border-border/70 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--vibe-blue)]"
                >
                  {item.label}
                </div>
              )
            }
            if (!item.key) return null
            const val = (config as Record<string, unknown>)[item.key]
            const enMeta = FIELD_LABELS_EN[item.key]
            const displayLabel = lang === "en" && enMeta ? enMeta.label : item.label || item.key
            const displayHelp = lang === "en" && enMeta ? enMeta.help : item.help

            return (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-medium text-foreground">{displayLabel}</label>
                  {item.type === "boolean" && (
                    <input
                      type="checkbox"
                      checked={Boolean(val)}
                      onChange={(e) => updateField(item.key!, e.target.checked)}
                      className="size-4 cursor-pointer accent-[var(--vibe-blue)]"
                    />
                  )}
                </div>

                {item.type === "select" && item.options && (
                  <select
                    value={String(val ?? item.default)}
                    onChange={(e) => updateField(item.key!, e.target.value)}
                    className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground outline-none focus:border-ring"
                  >
                    {item.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label || opt.value}
                      </option>
                    ))}
                  </select>
                )}

                {item.type === "number" && (
                  <input
                    type="number"
                    min={item.min}
                    max={item.max}
                    value={Number(val ?? item.default)}
                    onChange={(e) => updateField(item.key!, Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground outline-none focus:border-ring"
                  />
                )}

                {item.type === "string" && (
                  <input
                    type="text"
                    value={String(val ?? "")}
                    onChange={(e) => updateField(item.key!, e.target.value)}
                    placeholder={String(item.default ?? "")}
                    className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground outline-none focus:border-ring"
                  />
                )}

                {item.type === "text" && (
                  <textarea
                    rows={2}
                    value={String(val ?? "")}
                    onChange={(e) => updateField(item.key!, e.target.value)}
                    placeholder={tr("输入站点顶部公告文案…", "Enter site announcement banner text…")}
                    className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground outline-none focus:border-ring"
                  />
                )}

                {displayHelp && <p className="text-[11px] text-muted-foreground">{displayHelp}</p>}
              </div>
            )
          })}
        </div>

        <div className="space-y-2.5 border-t bg-card-subtle px-5 py-3.5">
          {status && (
            <p
              className={`flex items-center gap-1.5 text-xs font-medium ${
                status.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
              }`}
            >
              {status.type === "ok" && <Check className="size-3.5" />}
              {status.text}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="size-3.5" /> {tr("恢复默认", "Reset Defaults")}
            </Button>
            {authed ? (
              <Button size="sm" onClick={handleSaveToHub} disabled={saving}>
                <Save className="size-3.5" />{" "}
                {saving ? tr("保存中…", "Saving…") : tr("保存站点配置", "Save Site Config")}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={onClose}>
                {tr("完成预览", "Done")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
