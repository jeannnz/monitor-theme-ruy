import type { Node } from "./api.ts"

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

const unitOf = (n: number) => Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1)

export function bytes(n: number, digits?: number): string {
  if (!n || n < 1) return "0 B"
  const i = unitOf(n)
  const v = n / 1024 ** i
  return `${v.toFixed(i === 0 ? 0 : (digits ?? (v >= 100 ? 0 : v >= 10 ? 1 : 2)))} ${UNITS[i]}`
}

export function pair(used: number, total: number): string {
  if (used > 0 && total > 0 && unitOf(used) === unitOf(total)) {
    const i = unitOf(total)
    const f = (n: number) => (n / 1024 ** i).toFixed(i === 0 ? 0 : 2)
    return `${f(used)} / ${f(total)} ${UNITS[i]}`
  }
  return `${bytes(used)} / ${bytes(total)}`
}

export function axisBytes(v: number): string {
  if (!v || v < 0) return "0 B"
  return bytes(v, v / 1024 ** unitOf(v) >= 100 ? 0 : 1).replace(".0 ", " ")
}

export function rate(n: number): string {
  return `${bytes(n, 1)}/s`
}

export function percent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0
}

export function uptime(seconds: number, lang: "zh" | "en" = "zh"): string {
  if (!seconds) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (lang === "en") {
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  return d > 0 ? `${d} 天 ${h} 小时` : h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`
}

export function daysUntil(date?: string | null): number | null {
  if (!date) return null
  const target = new Date(`${date}T00:00:00`).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / 86400000)
}

export function expiresIn(node: Pick<Node, "expires_in" | "expires_at">): number | null {
  return node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
}

export function monthUsage(node: Pick<Node, "month_used" | "month_rx" | "month_tx" | "traffic_mode">): number {
  if (typeof node.month_used === "number") return node.month_used
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up":
      return tx
    case "down":
      return rx
    case "max":
      return Math.max(rx, tx)
    default:
      return rx + tx
  }
}

export function trafficModeLabel(mode: string, lang: "zh" | "en" = "zh"): string {
  if (lang === "en") {
    switch (mode) {
      case "up":
        return "Outbound Only"
      case "down":
        return "Inbound Only"
      case "max":
        return "Max Direction"
      default:
        return "Bidirectional"
    }
  }
  switch (mode) {
    case "up":
      return "仅计上行"
    case "down":
      return "仅计下行"
    case "max":
      return "取单向最高"
    default:
      return "双向总和"
  }
}

export const FOREVER = "∞"

const MONEY = new Map<string, Intl.NumberFormat>()

export function money(amount: number, currency: string): string {
  try {
    let format = MONEY.get(currency)
    if (!format) {
      format = new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 })
      MONEY.set(currency, format)
    }
    return format.format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`.trim()
  }
}

const NAMED_CYCLES: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
}
const CYCLE_WORDS: Record<number, string> = { 1: "月付", 3: "季付", 6: "半年付", 12: "年付" }
const CYCLE_WORDS_EN: Record<number, string> = { 1: "mo", 3: "qtr", 6: "6mo", 12: "yr" }

export function cycleMonths(billing: string): number {
  if (billing === "once") return 0
  return NAMED_CYCLES[billing] ?? Number(/^(\d+)m$/.exec(billing)?.[1])
}

export function cycle(billing: string, lang: "zh" | "en" = "zh"): string {
  if (billing === "once") return lang === "en" ? "One-time" : "一次性"
  const months = cycleMonths(billing)
  if (!months) return billing
  if (lang === "en") {
    return CYCLE_WORDS_EN[months] ?? (months % 12 ? `${months}mo` : `${months / 12}yr`)
  }
  return CYCLE_WORDS[months] ?? (months % 12 ? `${months} 个月付` : `${months / 12} 年付`)
}

const HHMM = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" })

const MDHHMM = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const MMDD = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" })

export function clockFor(hours: number): (ms: number) => string {
  return hours <= 24 ? HHMM.format : MDHHMM.format
}

export function tickClock(ticks: number[], hours: number): (ms: number) => string {
  const midnight = (t: number) => new Date(t).getHours() === 0 && new Date(t).getMinutes() === 0
  return ticks.length > 0 && ticks.every(midnight) ? MMDD.format : clockFor(hours)
}

const WINDOWS = [1, 6, 24, 168, 720, 2160]

export function windows(days: number, lang: "zh" | "en" = "zh"): { hours: number; label: string }[] {
  const whole = Math.max(1, Math.floor(days)) * 24
  return [...WINDOWS.filter((h) => h * 1.25 <= whole), whole].map((hours) => ({
    hours,
    label:
      lang === "en"
        ? hours < 24
          ? `${hours}h`
          : hours === 8760
            ? "1y"
            : `${hours / 24}d`
        : hours < 24
          ? `${hours} 小时`
          : hours === 8760
            ? "1 年"
            : `${hours / 24} 天`,
  }))
}

export function osName(name: string): string {
  return name.replace("GNU/Linux ", "").replace(/\s*\([^)]*\)\s*$/, "")
}

export function cpuName(name: string): string {
  return name
    .replace(/\((R|TM|r|tm)\)/g, "")
    .replace(/\s+(CPU|Processor)\b/g, "")
    .replace(/\s+\d+-Core\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 20160].map((m) => m * 60_000)
const TICK_MONTHS = [1, 2, 3, 6, 12]

export function timeTicks(from: number, to: number, count = 8): number[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= count)
  if (step === undefined) return monthTicks(from, to, count)
  const zone = new Date(from).getTimezoneOffset() * 60_000
  const ticks: number[] = []
  for (let t = Math.ceil((from - zone) / step) * step + zone; t <= to; t += step) {
    const tick = step < 86_400_000 ? t : new Date(t + 43_200_000).setHours(0, 0, 0, 0)
    if (tick <= to) ticks.push(tick)
  }
  return ticks
}

function monthTicks(from: number, to: number, count: number): number[] {
  const start = new Date(from)
  const every = TICK_MONTHS.find((k) => (to - from) / (k * 30 * 86_400_000) <= count) ?? 12
  let month = start.getFullYear() * 12 + start.getMonth()
  if (new Date(start.getFullYear(), start.getMonth(), 1).getTime() < from) month++
  const ticks: number[] = []
  for (month = Math.ceil(month / every) * every; ; month += every) {
    const t = new Date(Math.floor(month / 12), month % 12, 1).getTime()
    if (t > to) return ticks
    ticks.push(t)
  }
}

export function axisTop(max: number, floor: number, cap: number): number {
  const target = Math.min(cap, Math.max(max, floor)) / 4
  const scale = 10 ** Math.floor(Math.log10(target))
  return Math.min(cap, LADDER.find((m) => m * scale >= target)! * scale * 4)
}

const LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]

export function quarters(top: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => top * f)
}

export function withGaps<T extends { ts: number }>(rows: T[]): (T | { ts: number })[] {
  const gaps = rows.slice(1).map((r, i) => r.ts - rows[i].ts).sort((a, b) => a - b)
  const usual = gaps[(gaps.length - 1) >> 1]
  return rows.flatMap((r, i) =>
    i > 0 && r.ts - rows[i - 1].ts > 2 * usual ? [{ ts: (r.ts + rows[i - 1].ts) / 2 }, r] : [r],
  )
}

const rung = (i: number) => 1024 ** Math.floor(i / 3) * 10 ** (i % 3)
const FLOOR = 3
export const RATE_FLOOR = rung(FLOOR)

export function rateAxis(low: number, high: number): { domain: [number, number]; ticks: number[] } {
  let bottom = FLOOR
  while (rung(bottom + 1) <= Math.min(low, high)) bottom++
  let top = bottom + 1
  while (rung(top) < high) top++
  const step = Math.ceil((top - bottom) / 5)
  const ticks: number[] = []
  for (let i = top; i >= bottom; i -= step) ticks.unshift(rung(i))
  return { domain: [rung(bottom), rung(top)], ticks }
}

export function despike(values: (number | null)[], window = 7, sigmas = 3): (number | null)[] {
  const half = window >> 1
  return values.map((v, i) => {
    if (v === null) return v
    const near = values.slice(Math.max(0, i - half), i + half + 1).filter((n) => n !== null)
    const mid = median(near)
    const mad = Math.max(median(near.map((n) => Math.abs(n - mid))), 1)
    return Math.abs(v - mid) > sigmas * 1.4826 * mad ? mid : v
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const half = sorted.length >> 1
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
}

export function sinceSeen(node: { last_seen: number; last_seen_ago?: number | null }): number {
  if (node.last_seen_ago !== undefined) return node.last_seen_ago ?? 0
  return node.last_seen ? Date.now() / 1000 - node.last_seen : 0
}

/** Country metadata for Vibe Global Reach Map & Region Grouping */
const COUNTRY_INFO: Record<
  string,
  {
    name: string
    nameEn: string
    region: "亚太地区" | "美洲地区" | "欧洲地区" | "其他地区"
    regionEn: "Asia Pacific" | "Americas" | "Europe" | "Other Regions"
    lat: number
    lon: number
  }
> = {
  CN: { name: "中国", nameEn: "China", region: "亚太地区", regionEn: "Asia Pacific", lat: 35.8, lon: 104.1 },
  HK: { name: "中国香港", nameEn: "Hong Kong", region: "亚太地区", regionEn: "Asia Pacific", lat: 22.3, lon: 114.2 },
  TW: { name: "中国台湾", nameEn: "Taiwan", region: "亚太地区", regionEn: "Asia Pacific", lat: 23.7, lon: 121.0 },
  MO: { name: "中国澳门", nameEn: "Macau", region: "亚太地区", regionEn: "Asia Pacific", lat: 22.2, lon: 113.5 },
  JP: { name: "日本", nameEn: "Japan", region: "亚太地区", regionEn: "Asia Pacific", lat: 35.7, lon: 139.7 },
  KR: { name: "韩国", nameEn: "South Korea", region: "亚太地区", regionEn: "Asia Pacific", lat: 37.6, lon: 127.0 },
  SG: { name: "新加坡", nameEn: "Singapore", region: "亚太地区", regionEn: "Asia Pacific", lat: 1.35, lon: 103.8 },
  MY: { name: "马来西亚", nameEn: "Malaysia", region: "亚太地区", regionEn: "Asia Pacific", lat: 3.14, lon: 101.7 },
  TH: { name: "泰国", nameEn: "Thailand", region: "亚太地区", regionEn: "Asia Pacific", lat: 13.75, lon: 100.5 },
  VN: { name: "越南", nameEn: "Vietnam", region: "亚太地区", regionEn: "Asia Pacific", lat: 21.0, lon: 105.8 },
  ID: { name: "印度尼西亚", nameEn: "Indonesia", region: "亚太地区", regionEn: "Asia Pacific", lat: -6.2, lon: 106.8 },
  IN: { name: "印度", nameEn: "India", region: "亚太地区", regionEn: "Asia Pacific", lat: 20.6, lon: 78.9 },
  AU: { name: "澳大利亚", nameEn: "Australia", region: "亚太地区", regionEn: "Asia Pacific", lat: -33.9, lon: 151.2 },
  NZ: { name: "新西兰", nameEn: "New Zealand", region: "亚太地区", regionEn: "Asia Pacific", lat: -36.8, lon: 174.8 },
  US: { name: "美国", nameEn: "United States", region: "美洲地区", regionEn: "Americas", lat: 37.1, lon: -95.7 },
  CA: { name: "加拿大", nameEn: "Canada", region: "美洲地区", regionEn: "Americas", lat: 45.4, lon: -75.7 },
  BR: { name: "巴西", nameEn: "Brazil", region: "美洲地区", regionEn: "Americas", lat: -23.5, lon: -46.6 },
  MX: { name: "墨西哥", nameEn: "Mexico", region: "美洲地区", regionEn: "Americas", lat: 19.4, lon: -99.1 },
  CL: { name: "智利", nameEn: "Chile", region: "美洲地区", regionEn: "Americas", lat: -33.4, lon: -70.6 },
  DE: { name: "德国", nameEn: "Germany", region: "欧洲地区", regionEn: "Europe", lat: 50.1, lon: 8.68 },
  NL: { name: "荷兰", nameEn: "Netherlands", region: "欧洲地区", regionEn: "Europe", lat: 52.4, lon: 4.9 },
  GB: { name: "英国", nameEn: "United Kingdom", region: "欧洲地区", regionEn: "Europe", lat: 51.5, lon: -0.12 },
  FR: { name: "法国", nameEn: "France", region: "欧洲地区", regionEn: "Europe", lat: 48.9, lon: 2.35 },
  CH: { name: "瑞士", nameEn: "Switzerland", region: "欧洲地区", regionEn: "Europe", lat: 47.4, lon: 8.54 },
  SE: { name: "瑞典", nameEn: "Sweden", region: "欧洲地区", regionEn: "Europe", lat: 59.3, lon: 18.1 },
  FI: { name: "芬兰", nameEn: "Finland", region: "欧洲地区", regionEn: "Europe", lat: 60.2, lon: 24.9 },
  RU: { name: "俄罗斯", nameEn: "Russia", region: "欧洲地区", regionEn: "Europe", lat: 55.8, lon: 37.6 },
  PL: { name: "波兰", nameEn: "Poland", region: "欧洲地区", regionEn: "Europe", lat: 52.2, lon: 21.0 },
  IT: { name: "意大利", nameEn: "Italy", region: "欧洲地区", regionEn: "Europe", lat: 41.9, lon: 12.5 },
  ES: { name: "西班牙", nameEn: "Spain", region: "欧洲地区", regionEn: "Europe", lat: 40.4, lon: -3.7 },
  TR: { name: "土耳其", nameEn: "Turkey", region: "欧洲地区", regionEn: "Europe", lat: 41.0, lon: 29.0 },
  ZA: { name: "南非", nameEn: "South Africa", region: "其他地区", regionEn: "Other Regions", lat: -33.9, lon: 18.4 },
  AE: { name: "阿联酋", nameEn: "UAE", region: "其他地区", regionEn: "Other Regions", lat: 25.2, lon: 55.3 },
}

export function countryInfo(code: string, lang: "zh" | "en" = "zh") {
  const upper = (code || "").toUpperCase()
  const item = COUNTRY_INFO[upper]
  if (!item) {
    return {
      name: upper || (lang === "en" ? "Unknown" : "未知区域"),
      region: lang === "en" ? "Other Regions" : "其他地区",
      lat: 20,
      lon: 0,
    }
  }
  return {
    name: lang === "en" ? item.nameEn : item.name,
    region: lang === "en" ? item.regionEn : item.region,
    lat: item.lat,
    lon: item.lon,
  }
}

/**
 * Maps a single utilization percentage (0-100+) into a 0-100 health score,
 * where `soft` marks the upper bound of the comfortable operating zone (score 80).
 */
function dimensionHealth(pct: number, soft: number): number {
  const clamped = Math.max(0, pct)
  if (clamped <= soft) {
    return 100 - (clamped / Math.max(1, soft)) * 20
  }
  return Math.max(0, 80 - ((clamped - soft) / Math.max(1, 100 - soft)) * 80)
}

/**
 * Computes a 0-100 comprehensive cluster load health score across all servers'
 * CPU, Memory (RAM), Disk, and Monthly Traffic metrics.
 */
export function computeFleetHealth(
  nodes: Node[],
  lang: "zh" | "en" = "zh",
): {
  score: number
  compositeLoad: number
  cpuLoad: number
  memLoad: number
  diskLoad: number
  trafficLoad: number | null
  busyNodes: number
  statusLabel: string
  statusTone: "healthy" | "warning" | "critical"
} {
  const reporting = nodes.filter((n) => n.online && n.metrics)
  if (nodes.length === 0 || reporting.length === 0) {
    return {
      score: 100,
      compositeLoad: 0,
      cpuLoad: 0,
      memLoad: 0,
      diskLoad: 0,
      trafficLoad: null,
      busyNodes: 0,
      statusLabel: lang === "en" ? "Idle" : "空闲",
      statusTone: "healthy",
    }
  }

  // 1. Core-weighted cluster CPU load
  const totalCores = reporting.reduce((s, n) => s + Math.max(1, n.cpu_cores), 0)
  const cpuLoad =
    reporting.reduce((s, n) => s + n.metrics!.cpu * Math.max(1, n.cpu_cores), 0) /
    Math.max(1, totalCores)

  // 2. Aggregate cluster Memory & Disk load
  const totalMem = reporting.reduce((s, n) => s + n.mem_total, 0)
  const usedMem = reporting.reduce((s, n) => s + n.metrics!.mem_used, 0)
  const memLoad = percent(usedMem, totalMem)

  const totalDisk = reporting.reduce((s, n) => s + n.disk_total, 0)
  const usedDisk = reporting.reduce((s, n) => s + n.metrics!.disk_used, 0)
  const diskLoad = percent(usedDisk, totalDisk)

  // 3. Aggregate cluster Monthly Traffic quota load
  const cappedNodes = nodes.filter((n) => n.traffic_limit > 0)
  const totalQuota = cappedNodes.reduce((s, n) => s + n.traffic_limit, 0)
  const usedQuota = cappedNodes.reduce((s, n) => s + monthUsage(n), 0)
  const trafficLoad = totalQuota > 0 ? Math.min(100, percent(usedQuota, totalQuota)) : null

  // 4. Hotspot / overloaded server count across CPU, RAM, Disk, Traffic
  let busyNodes = 0
  for (const n of nodes) {
    const m = n.online ? n.metrics : null
    const highCpu = m ? m.cpu >= 80 : false
    const highMem = m ? percent(m.mem_used, n.mem_total) >= 85 : false
    const highDisk = m ? percent(m.disk_used, n.disk_total) >= 85 : false
    const highTraffic =
      n.traffic_limit > 0 && percent(monthUsage(n), n.traffic_limit) >= 90
    if (highCpu || highMem || highDisk || highTraffic) {
      busyNodes++
    }
  }

  // 5. Weighted composite load & health score
  const compositeLoad =
    trafficLoad !== null
      ? cpuLoad * 0.35 + memLoad * 0.25 + diskLoad * 0.2 + trafficLoad * 0.2
      : cpuLoad * 0.45 + memLoad * 0.3 + diskLoad * 0.25

  const cpuHealth = dimensionHealth(cpuLoad, 50)
  const memHealth = dimensionHealth(memLoad, 65)
  const diskHealth = dimensionHealth(diskLoad, 70)
  const trafficHealth = trafficLoad !== null ? dimensionHealth(trafficLoad, 75) : 100

  const baseHealth =
    trafficLoad !== null
      ? cpuHealth * 0.35 + memHealth * 0.25 + diskHealth * 0.2 + trafficHealth * 0.2
      : cpuHealth * 0.45 + memHealth * 0.3 + diskHealth * 0.25

  const hotspotPenalty = (busyNodes / Math.max(1, nodes.length)) * 15
  const score = Math.round(Math.min(100, Math.max(0, baseHealth - hotspotPenalty)))

  if (score >= 80) {
    return {
      score,
      compositeLoad,
      cpuLoad,
      memLoad,
      diskLoad,
      trafficLoad,
      busyNodes,
      statusLabel: lang === "en" ? "Healthy" : "健康",
      statusTone: "healthy",
    }
  }
  if (score >= 60) {
    return {
      score,
      compositeLoad,
      cpuLoad,
      memLoad,
      diskLoad,
      trafficLoad,
      busyNodes,
      statusLabel: lang === "en" ? "Balanced" : "均衡",
      statusTone: "healthy",
    }
  }
  if (score >= 40) {
    return {
      score,
      compositeLoad,
      cpuLoad,
      memLoad,
      diskLoad,
      trafficLoad,
      busyNodes,
      statusLabel: lang === "en" ? "Elevated" : "偏高",
      statusTone: "warning",
    }
  }
  return {
    score,
    compositeLoad,
    cpuLoad,
    memLoad,
    diskLoad,
    trafficLoad,
    busyNodes,
    statusLabel: lang === "en" ? "Overload" : "过载",
    statusTone: "critical",
  }
}
