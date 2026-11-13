// Standalone local mock hub for developing and previewing the theme on 127.0.0.1:9911
// Implements the full Monitor Hub 1.5.x public + theme config API:
// - GET  /api/me
// - GET  /api/nodes
// - GET  /api/nodes/:id/metrics
// - GET  /api/themes/:short/config
// - PUT  /api/themes/:short/config
// - WS   /api/ws (?gzip supported)

import http from "node:http"
import crypto from "node:crypto"
import zlib from "node:zlib"

const PORT = Number(process.env.MOCK_HUB_PORT || 9911)
const HISTORY_DAYS = 30
const GiB = 1024 ** 3

let savedConfig = {}

function noise(...xs) {
  let h = 2166136261
  for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619) ^ (h >>> 13)
  return ((h >>> 0) % 100000) / 100000
}

const SEED = [
  ["东京 · 软银 BB", "JP", "亚太主力", "monthly", "CNY", 39.9, 18, "三网软银直连 · 低延迟", "ok"],
  ["香港 · CMI 专线", "HK", "亚太主力", "quarterly", "HKD", 158, 5, "移动 CMI 回程优化", "ok"],
  ["新加坡 · BGP", "SG", "亚太主力", "yearly", "USD", 49.99, -2, "亚太互联枢纽", "offline"],
  ["首尔 · KT 原生", "KR", "亚太主力", "60m", "KRW", 150000, 420, "韩区原生 IP 节点", "ok"],
  ["洛杉矶 · CN2 GIA", "US", "美洲核心", "yearly", "USD", 45.9, 286, "晚高峰三网 GIA 精品网", "ok"],
  ["圣何塞 · 9929", "US", "美洲核心", "once", "USD", 120, null, "联通 A网 9929 线路", "ok"],
  ["西雅图 · 高防计算", "US", "美洲核心", "monthly", "USD", 12.5, 40, "DDoS 防护清洗节点", "ok"],
  ["法兰克福 · 9929", "DE", "欧洲互联", "biennial", "EUR", 79, 500, "欧洲核心交换中心", "ok"],
  ["阿姆斯特丹 · 10Gbps", "NL", "欧洲互联", "semiannual", "EUR", 24, 60, "大带宽流媒体中转", "fresh"],
  ["伦敦 · 金融专区", "GB", "欧洲互联", "triennial", "GBP", 99, 890, "低抖动专线", "ok"],
  ["悉尼 · 联通直连", "AU", "", "monthly", "AUD", 9.5, 21, "", "ok"],
  ["深圳 · 本地 NAS", "CN", "", "once", "CNY", 0, null, "内网存储与备份宿主", "ok"],
]

const NODES = Array.from({ length: 18 }, (_, i) => {
  const s = SEED[i % SEED.length]
  return {
    id: i + 1,
    seed: s,
    name: i < SEED.length ? s[0] : `${s[0]} #${Math.floor(i / SEED.length) + 1}`,
  }
})

function today() {
  return new Date().toISOString().slice(0, 10)
}
function plusDays(days) {
  return new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10)
}

function sample(id, t) {
  const day = Math.sin(((t % 86400) / 86400) * 2 * Math.PI)
  const n = (k) => noise(id, k, Math.floor(t / 2))
  const cpu = Math.min(98, 8 + 26 * (1 + day) * noise(id, 1) + 18 * n(2))
  const rx = Math.round((3e5 + 4.5e6 * noise(id, 3) * (1 + day)) * (0.5 + n(4)))
  const tx = Math.round(rx * (0.35 + 0.5 * noise(id, 5)))
  return { cpu, rx, tx }
}

function sizes(id) {
  return {
    memTotal: (2 + Math.floor(noise(id, 6) * 14)) * GiB,
    diskTotal: (40 + Math.floor(noise(id, 7) * 280)) * GiB,
  }
}

const OFFLINE_FOR = 3 * 3600 + 1200

function buildNode(n, now) {
  const [, country, group, cycle, currency, price, expires, remark, state] = n.seed
  const { memTotal, diskTotal } = sizes(n.id)
  const month = 2 * Math.round((0.15 + noise(n.id, 8) * 0.75) * 450) * GiB
  const total = month * 5
  const s = sample(n.id, now)
  const online = state !== "offline"
  const metrics =
    state === "ok"
      ? {
          cpu: s.cpu,
          load: [
            Number((s.cpu / 38).toFixed(2)),
            Number((s.cpu / 45).toFixed(2)),
            Number((s.cpu / 52).toFixed(2)),
          ],
          mem_total: memTotal,
          mem_used: Math.round(memTotal * (0.25 + 0.55 * noise(n.id, 9))),
          swap_total: 2 * GiB,
          swap_used: Math.round(2 * GiB * (0.06 + 0.15 * noise(n.id, 11))),
          disk_total: diskTotal,
          disk_used: Math.round(diskTotal * (0.18 + 0.68 * noise(n.id, 10))),
          net_rx: s.rx,
          net_tx: s.tx,
          tcp: 32 + n.id * 4,
          udp: 8 + (n.id % 7),
          procs: 110 + n.id * 3,
          uptime: 86400 * (15 + n.id * 2) + (now % 86400),
          total_rx: total,
          total_tx: Math.round(total * 0.65),
          month_rx: month,
          month_tx: Math.round(month * 0.5),
        }
      : null

  return {
    id: n.id,
    name: n.name,
    sort: n.id,
    public: true,
    online,
    metrics,
    country,
    group,
    public_remark: remark,
    os: n.id % 3 === 0 ? "Ubuntu 24.04 LTS (Noble Numbat)" : n.id % 4 === 0 ? "Alpine Linux v3.20" : "Debian GNU/Linux 13 (trixie)",
    kernel: "6.12.0-amd64",
    arch: n.id % 5 === 0 ? "aarch64" : "x86_64",
    virt: "kvm",
    cpu_name: n.id % 2 === 0 ? "AMD EPYC 9654 96-Core Processor" : "Intel(R) Xeon(R) Gold 6430",
    cpu_cores: 2 + (n.id % 6),
    mem_total: memTotal,
    swap_total: 2 * GiB,
    disk_total: diskTotal,
    agent_version: "1.5.1",
    ...(state === "fresh"
      ? { last_seen: 0, last_seen_ago: null }
      : { last_seen: online ? now : now - OFFLINE_FOR, last_seen_ago: online ? 0 : OFFLINE_FOR }),
    billing_cycle: cycle,
    currency,
    price,
    expires_at: expires === null ? null : plusDays(expires),
    expires_in: expires,
    traffic_limit: n.id % 6 === 0 ? 0 : 1024 * GiB,
    traffic_mode: n.id % 4 === 0 ? "max" : "sum",
    traffic_reset_day: 1,
    month_start: today().slice(0, 8) + "01",
    month_rx: month,
    month_tx: Math.round(month * 0.5),
    month_used: Math.round(month * 1.5),
    day_rx: Math.round(month / 22),
    day_tx: Math.round(month / 38),
    total_rx: total,
    total_tx: Math.round(total * 0.65),
  }
}

function snapshot() {
  const now = Math.floor(Date.now() / 1000)
  return { admin: true, nodes: NODES.map((n) => buildNode(n, now)) }
}

function history(n, urlObj) {
  const q = urlObj.searchParams
  const hours = Math.min(Math.max(Number(q.get("hours")) || 6, 1), HISTORY_DAYS * 24)
  const budget = Math.min(Math.max(Number(q.get("points")) || 1440, 60), 1440)
  const unit = hours > 7 * 24 ? 3600 : 60
  const step = unit * Math.max(1, Math.ceil((hours * 3600) / unit / budget))
  const now = Math.floor(Date.now() / 1000)
  const since = Math.floor((now - hours * 3600) / step) * step
  const state = n.seed[8]
  const until = state === "fresh" ? since - 1 : state === "offline" ? now - OFFLINE_FOR : now
  const { memTotal, diskTotal } = sizes(n.id)
  const series = q.get("series")
  const metrics = []
  const ping = []
  const loss = {}

  if (series !== "ping") {
    for (let ts = since; ts <= until; ts += step) {
      const minutes = ts + step > until ? Math.max(1, Math.floor((until - ts) / 60)) : step / 60
      const s = sample(n.id, ts)
      const peak = 1 + 1.8 * noise(n.id, ts, 11)
      metrics.push({
        ts,
        minutes,
        cpu: s.cpu,
        cpu_max: Math.min(100, s.cpu * peak),
        mem_used: Math.round(memTotal * (0.32 + 0.22 * noise(n.id, ts, 12))),
        disk_used: Math.round(diskTotal * (0.22 + 0.55 * noise(n.id, 10))),
        net_rx: s.rx,
        net_tx: s.tx,
        net_rx_max: Math.round(s.rx * peak),
        net_tx_max: Math.round(s.tx * peak),
        swap_used: Math.round(2 * GiB * (0.08 + 0.05 * noise(n.id, ts, 13))),
        tcp: Math.round(28 + n.id * 3 + 8 * noise(n.id, ts, 14)),
        udp: Math.round(6 + 4 * noise(n.id, ts, 15)),
        procs: Math.round(105 + n.id * 2 + 6 * noise(n.id, ts, 16)),
      })
    }
  }

  if (series !== "metrics") {
    const country = n.seed[1]
    const baseByRegion =
      country === "CN" || country === "HK"
        ? 14
        : country === "JP" || country === "KR"
          ? 34
          : country === "SG"
            ? 56
            : country === "US" || country === "AU"
              ? 118
              : 145
    const lossRate = n.id === 7 ? 0.16 : n.id === 6 ? 0.035 : n.id % 5 === 0 ? 0.015 : 0
    const jitterAmp = n.id === 6 ? 58 : n.id === 7 ? 42 : 10

    for (const task_id of [1, 2, 3]) {
      let lost = 0
      let rows = 0
      for (let ts = since; ts <= until; ts += step, rows++) {
        if (lossRate > 0 && noise(n.id, ts, task_id) < lossRate) {
          lost++
          ping.push({ ts, task_id, latency: null, loss: 100 })
          continue
        }
        const wave = Math.sin(ts / 900 + task_id) * (jitterAmp * 0.45)
        const latency = Math.max(
          4,
          Math.round(
            baseByRegion +
              (task_id - 1) * 11 +
              14 * noise(n.id, task_id) +
              wave +
              jitterAmp * (noise(n.id, ts, task_id, 1) - 0.35),
          ),
        )
        const spread = Math.round(3 + 14 * noise(n.id, ts, task_id, 2))
        const row = { ts, task_id, latency, band: [Math.max(1, latency - spread), latency + spread] }
        ping.push(row)
      }
      if (lost) loss[task_id] = Number(((100 * lost) / rows).toFixed(1))
    }
  }

  return {
    metrics,
    ping,
    step,
    probes: series === "metrics" ? {} : { 1: "电信 CN2", 2: "联通 9929", 3: "移动 CMI" },
    loss,
  }
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  const path = urlObj.pathname

  const sendJson = (obj, code = 200) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" })
    res.end(JSON.stringify(obj))
  }

  if (path === "/api/me") {
    return sendJson({
      authed: true,
      github: true,
      history_days: HISTORY_DAYS,
      public_page: true,
      site: urlObj.origin,
      site_name: "Vibe Cloud Monitor",
    })
  }

  if (path === "/api/nodes") {
    return sendJson(snapshot())
  }

  const m = /^\/api\/nodes\/(\d+)\/metrics$/.exec(path)
  if (m) {
    const target = NODES.find((n) => n.id === Number(m[1]))
    if (target) return sendJson(history(target, urlObj))
  }

  if (/^\/api\/themes\/[^/]+\/config$/.test(path)) {
    if (req.method === "PUT") {
      let body = ""
      req.on("data", (chunk) => (body += chunk))
      req.on("end", () => {
        try {
          savedConfig = JSON.parse(body || "{}")
          sendJson(savedConfig)
        } catch {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
          res.end("无效的 JSON 配置")
        }
      })
      return
    }
    return sendJson(savedConfig)
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  res.end("接口不存在")
})

// Minimal RFC 6455 WebSocket upgrade handler for /api/ws
function encodeWsFrame(payloadBuffer, isBinary) {
  const opcode = isBinary ? 0x82 : 0x81
  const len = payloadBuffer.length
  let header
  if (len < 126) {
    header = Buffer.from([opcode, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = opcode
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payloadBuffer])
}

server.on("upgrade", (req, socket) => {
  const urlObj = new URL(req.url || "/", "http://localhost")
  if (urlObj.pathname !== "/api/ws") {
    socket.destroy()
    return
  }
  const key = req.headers["sec-websocket-key"]
  if (!key) {
    socket.destroy()
    return
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64")

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"),
  )

  const useGzip = urlObj.searchParams.has("gzip")
  const push = () => {
    if (socket.destroyed) return
    const json = JSON.stringify(snapshot())
    if (useGzip) {
      const compressed = zlib.gzipSync(Buffer.from(json))
      socket.write(encodeWsFrame(compressed, true))
    } else {
      socket.write(encodeWsFrame(Buffer.from(json), false))
    }
  }

  push()
  const timer = setInterval(push, 2000)
  socket.on("close", () => clearInterval(timer))
  socket.on("error", () => clearInterval(timer))
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock Monitor Hub listening on http://127.0.0.1:${PORT}`)
})
