import { useEffect, useState } from "react"

export type Metrics = {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export type Node = {
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  /** ISO 3166-1 alpha-2, or empty when the hub could not locate the address. */
  country: string
  /** Set by the operator; empty is ungrouped. Absent from a hub predating groups. */
  group?: string
  /** Public one-line remark set by the operator (up to 100 chars). */
  public_remark?: string
  last_seen: number
  /** Seconds since `last_seen` on the hub's clock, null for a node never seen. Absent on older hubs. */
  last_seen_ago?: number | null
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number
  currency: string
  billing_cycle: string
  expires_at: string | null
  /**
   * Days until `expires_at` on the hub's calendar, negative once past, null
   * without a date. Absent on older hubs.
   */
  expires_in?: number | null
  traffic_limit: number
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  /** This period's usage as the plan meters it (`traffic_mode`). Absent on older hubs. */
  month_used?: number
  month_start: string
  day_rx: number
  day_tx: number
  /** Panel / admin session only. */
  hostname?: string
  ip?: string
  ipv4?: string
  ipv6?: string
  remark?: string
}

/** Every group in use, in the order of the first node carrying it: the operator's node order decides the tab order. */
export function groupsOf(nodes: Pick<Node, "group">[]): string[] {
  return [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function failure(res: Response): Promise<ApiError> {
  const text = res.headers.get("content-type")?.startsWith("text/plain") ? (await res.text()).trim() : ""
  return new ApiError(
    res.status,
    text || (res.status >= 500 ? `服务暂时无法访问（HTTP ${res.status}），稍后再试` : `请求被拦截（HTTP ${res.status}），稍后再试`),
  )
}

const TIMEOUT = 20_000
const RETRIES = 6

export async function api<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api${path}`, { signal: AbortSignal.timeout(TIMEOUT) })
      if (!res.ok) throw await failure(res)
      if (res.status === 204) return undefined as T
      return await res.json().catch((e) => {
        throw e instanceof SyntaxError ? new ApiError(res.status, "收到的不是状态数据，稍后再试") : e
      })
    } catch (e) {
      if (e instanceof ApiError) throw e
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
      if (!timedOut || attempt === RETRIES) {
        throw new ApiError(0, "网络连接失败，稍后再试")
      }
    }
  }
}

const KEEP = 60
export const speedHistory = new Map<string | null, { rx: number; tx: number }[]>()
export const nodeSpeedHistory = new Map<number, { rx: number; tx: number; cpu: number }[]>()
export const fleetStatsHistory = new Map<string | null, { onlineRatio: number; avgCpu: number; maxCpu: number; memPct: number }[]>()

export function sample(nodes: Node[]) {
  const totals = new Map<string | null, { rx: number; tx: number }>()
  const buckets = new Map<string | null, { total: number; online: number; cpuSum: number; maxCpu: number; memUsed: number; memTotal: number }>()
  const seenIds = new Set<number>()

  for (const n of nodes) {
    seenIds.add(n.id)
    const nodeSeries = nodeSpeedHistory.get(n.id) ?? []
    nodeSeries.push({
      rx: n.online && n.metrics ? n.metrics.net_rx : 0,
      tx: n.online && n.metrics ? n.metrics.net_tx : 0,
      cpu: n.online && n.metrics ? n.metrics.cpu : 0,
    })
    if (nodeSeries.length > 30) nodeSeries.shift()
    nodeSpeedHistory.set(n.id, nodeSeries)

    for (const key of [null, n.group ?? ""]) {
      const total = totals.get(key) ?? { rx: 0, tx: 0 }
      const b = buckets.get(key) ?? { total: 0, online: 0, cpuSum: 0, maxCpu: 0, memUsed: 0, memTotal: 0 }
      b.total += 1
      if (n.online) b.online += 1
      if (n.online && n.metrics) {
        total.rx += n.metrics.net_rx
        total.tx += n.metrics.net_tx
        b.cpuSum += n.metrics.cpu
        if (n.metrics.cpu > b.maxCpu) b.maxCpu = n.metrics.cpu
        b.memUsed += n.metrics.mem_used
        b.memTotal += n.metrics.mem_total
      }
      totals.set(key, total)
      buckets.set(key, b)
    }
  }

  for (const id of nodeSpeedHistory.keys()) if (!seenIds.has(id)) nodeSpeedHistory.delete(id)
  for (const key of speedHistory.keys()) if (!totals.has(key)) speedHistory.delete(key)
  for (const key of fleetStatsHistory.keys()) if (!buckets.has(key)) fleetStatsHistory.delete(key)

  for (const [key, total] of totals) {
    const series = speedHistory.get(key) ?? []
    series.push(total)
    if (series.length > KEEP) series.shift()
    speedHistory.set(key, series)
  }

  for (const [key, b] of buckets) {
    const series = fleetStatsHistory.get(key) ?? []
    series.push({
      onlineRatio: b.total > 0 ? (b.online / b.total) * 100 : 0,
      avgCpu: b.online > 0 ? b.cpuSum / b.online : 0,
      maxCpu: b.maxCpu,
      memPct: b.memTotal > 0 ? (b.memUsed / b.memTotal) * 100 : 0,
    })
    if (series.length > KEEP) series.shift()
    fleetStatsHistory.set(key, series)
  }
}

/** A malformed report must not remove every other node from the page. */
export function safeNodes(nodes: Node[]): Node[] {
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  const fields = ["uptime", "cpu", "mem_total", "mem_used", "swap_total", "swap_used", "disk_total", "disk_used",
    "net_rx", "net_tx", "total_rx", "total_tx", "month_rx", "month_tx", "tcp", "udp", "procs"] as const
  return nodes.map((node) => {
    const m = node.metrics
    return !m || (fields.every((key) => number(m[key])) && Array.isArray(m.load) && m.load.length === 3 && m.load.every(number))
      ? node : { ...node, metrics: null }
  })
}

const GZIP = typeof DecompressionStream === "function" ? "?gzip" : ""

const frameText = (data: string | Blob) =>
  typeof data === "string" ? data : new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).text()

export function useNodes() {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let silent: ReturnType<typeof setTimeout> | null = null

    let gap = false
    const receive = (list: Node[]) => {
      const safe = safeNodes(list)
      if (gap) {
        speedHistory.clear()
        nodeSpeedHistory.clear()
        fleetStatsHistory.clear()
      }
      gap = false
      sample(safe)
      setNodes(safe)
      setError(null)
      setClosed(false)
    }

    let epoch = 0
    const fetchOnce = () => {
      const started = epoch
      return api<{ nodes: Node[] }>("/nodes")
        .then((d) => {
          if (started === epoch) receive(d.nodes)
        })
        .catch((e: Error) => {
          if (started !== epoch) return
          if (e instanceof ApiError && e.status === 0 && socket?.readyState === WebSocket.OPEN) return
          setError(e.message)
          if (e instanceof ApiError && e.status === 401) setClosed(true)
        })
    }

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws${GZIP}`
    const connect = () => {
      let opened: WebSocket
      try {
        opened = new WebSocket(url)
      } catch {
        poll ??= setInterval(fetchOnce, 5000)
        return
      }
      socket = opened
      const watch = () => {
        if (silent) clearTimeout(silent)
        silent = setTimeout(() => {
          setError("实时数据中断，正在重新连接")
          resume()
        }, 10_000)
      }
      watch()
      let decoded = Promise.resolve()
      opened.onmessage = (event) => {
        decoded = decoded
          .then(async () => {
            const nodes = JSON.parse(await frameText(event.data)).nodes
            if (opened.readyState !== WebSocket.OPEN) return
            watch()
            receive(nodes)
            if (poll) {
              clearInterval(poll)
              poll = null
            }
          })
          .catch((e) => console.warn("live frame dropped:", e))
      }
      opened.onerror = () => opened.close()
      opened.onclose = () => {
        if (silent) clearTimeout(silent)
        poll ??= setInterval(fetchOnce, 5000)
        retry = setTimeout(connect, 5000)
      }
    }

    const pause = () => {
      epoch++
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      if (poll) clearInterval(poll)
      if (retry) clearTimeout(retry)
      if (silent) clearTimeout(silent)
      poll = retry = silent = null
    }
    const resume = () => {
      pause()
      gap = true
      fetchOnce()
      connect()
    }
    const visibility = () => (document.hidden ? pause() : resume())
    document.addEventListener("visibilitychange", visibility)
    resume()

    return () => {
      document.removeEventListener("visibilitychange", visibility)
      pause()
    }
  }, [])

  return { nodes, error, closed }
}
