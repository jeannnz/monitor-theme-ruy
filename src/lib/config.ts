import manifest from "../../theme.json"

export type ConfigField = {
  key?: string
  type: string
  label?: string
  help?: string
  default?: unknown
  options?: { value: string; label?: string }[]
  min?: number
  max?: number
}

export type ThemeConfig = {
  language: "zh" | "en" | "auto"
  subtitle: string
  notice: string
  accent_color: "blue" | "cyan" | "teal" | "indigo"
  default_theme: "system" | "light" | "dark"
  default_view: "grid" | "compact" | "table"
  columns: number
  show_kpi: boolean
  show_analytics: boolean
  map_style: "globe" | "dotted"
  show_sparkline: boolean
  show_billing: boolean
  footer_text: string
}

function fits(field: ConfigField, value: unknown): boolean {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean"
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (field.min ?? -Infinity) &&
        value <= (field.max ?? Infinity)
      )
    case "select":
      return !!field.options?.some((option) => option.value === value)
    default:
      return typeof value === "string"
  }
}

export const allManifestItems = manifest.config as ConfigField[]
export const fields = allManifestItems.filter((f): f is ConfigField & { key: string } => f.type !== "title" && typeof f.key === "string")

export function defaultConfig(): ThemeConfig {
  return Object.fromEntries(fields.map((f) => [f.key, f.default])) as unknown as ThemeConfig
}

export async function loadConfig(): Promise<ThemeConfig> {
  let saved: Record<string, unknown> = {}
  try {
    const res = await fetch(`/api/themes/${manifest.short}/config`)
    if (res.ok) saved = await res.json()
  } catch {
    // Offline or old hub falls back to defaults
  }
  const pick = (f: ConfigField & { key: string }) => (fits(f, saved[f.key]) ? saved[f.key] : f.default)
  return Object.fromEntries(fields.map((f) => [f.key, pick(f)])) as unknown as ThemeConfig
}

export async function saveConfig(values: Record<string, unknown>): Promise<void> {
  const url = `/api/themes/${manifest.short}/config`
  const read = await fetch(url)
  if (!read.ok) throw new Error(await read.text())
  const next: Record<string, unknown> = await read.json()
  for (const f of fields) {
    if (values[f.key] === f.default) delete next[f.key]
    else next[f.key] = values[f.key]
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  })
  if (!res.ok) throw new Error(await res.text())
}
