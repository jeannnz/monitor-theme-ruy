import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { Node } from "@/lib/api"
import { countryInfo } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { WORLD_COUNTRIES, WORLD_DOT_MATRIX } from "@/lib/worldData"

/* ============================================================================
 * 1. VibeSparkline — Smooth Area & Multi-Series Sparkline (KPI Cards & Node Cards)
 * ============================================================================ */
export function VibeSparkline({
  series,
  height = 36,
  className,
}: {
  series: { values: number[]; color: string; fillOpacity?: number; dashed?: boolean }[]
  height?: number
  className?: string
}) {
  const uid = useId().replace(/:/g, "")
  const top = Math.max(...series.flatMap((s) => s.values), 1)
  const width = Math.max(...series.map((s) => s.values.length), 2) - 1

  return (
    <svg
      viewBox={`0 0 120 ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      aria-hidden
    >
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`spark-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.24} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {series.map((s, i) => {
        const pts = s.values.length >= 2 ? s.values : [0, s.values[0] ?? 0]
        const coords = pts.map((v, x) => {
          const px = (x / Math.max(width, 1)) * 120
          const py = height - 3 - (Math.min(Math.max(v, 0), top) / top) * (height - 6)
          return [px, py] as const
        })
        const linePoints = coords.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")
        const areaPoints = `0,${height} ${linePoints} 120,${height}`
        return (
          <g key={i}>
            {!s.dashed && (
              <polygon points={areaPoints} fill={`url(#spark-${uid}-${i})`} />
            )}
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "3 3" : undefined}
              vectorEffect="non-scaling-stroke"
              points={linePoints}
            />
          </g>
        )
      })}
    </svg>
  )
}

/* ============================================================================
 * 2. VibeTickRing — High-Density Radial Tick Progress Gauge
 * ============================================================================ */
export function VibeTickRing({
  percent,
  label,
  sublabel,
  size = 168,
  ticks = 56,
  tone = "blue",
}: {
  percent: number
  label: string
  sublabel?: string
  size?: number
  ticks?: number
  tone?: "blue" | "cyan" | "teal"
}) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))
  const activeCount = Math.round((clamped / 100) * ticks)
  const center = size / 2
  const small = size <= 76
  const compact = size <= 116
  const outerR = size / 2 - (small ? 2 : compact ? 4 : 6)
  const innerR = outerR - (small ? 6.8 : compact ? 10 : 14)

  const strokeW = small
    ? ticks >= 40
      ? 1.32
      : 1.65
    : compact
      ? ticks >= 48
        ? 1.7
        : 2.1
      : ticks >= 50
        ? 2.0
        : 2.5

  const isCritical = clamped >= 90
  const mainStroke = isCritical
    ? "#f43f5e"
    : tone === "cyan"
      ? "var(--vibe-cyan)"
      : tone === "teal"
        ? "var(--vibe-teal)"
        : "var(--vibe-blue)"
  const tipStroke = isCritical
    ? "#fb7185"
    : tone === "cyan"
      ? "var(--vibe-blue-soft)"
      : "var(--vibe-cyan)"

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full">
        {Array.from({ length: ticks }, (_, i) => {
          // Start from top (-90 deg) clockwise
          const angle = (i / ticks) * 2 * Math.PI - Math.PI / 2
          const x1 = center + innerR * Math.cos(angle)
          const y1 = center + innerR * Math.sin(angle)
          const x2 = center + outerR * Math.cos(angle)
          const y2 = center + outerR * Math.sin(angle)
          const isActive = i < activeCount
          const isTip = isActive && i >= Math.max(0, activeCount - (small ? 5 : 7))
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isActive ? (isTip ? tipStroke : mainStroke) : "var(--track)"}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
        <span
          className={cn(
            "tnum font-bold tracking-tight text-foreground",
            small ? "text-[13px] leading-none" : compact ? "text-lg leading-none" : "text-2xl",
          )}
        >
          {label}
        </span>
        {sublabel && (
          <span
            className={cn(
              "tnum mt-0.5 truncate text-muted-foreground",
              small
                ? "max-w-[46px] text-[8px] leading-none"
                : compact
                  ? "max-w-[76px] text-[9px]"
                  : "max-w-[110px] text-[11px]",
            )}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * 3. VibeHalfGauge — High-Density Semi-Circular Tick Gauge with Needle
 * ============================================================================ */
export function VibeHalfGauge({
  score,
  statusLabel,
  statusTone,
  compact = false,
}: {
  score: number
  statusLabel: string
  statusTone: "healthy" | "warning" | "critical"
  compact?: boolean
}) {
  const clamped = Math.min(100, Math.max(0, score))
  const totalTicks = 33
  const activeTicks = Math.round((clamped / 100) * totalTicks)
  const cx = 110
  const cy = 102
  const outerR = 88
  const innerR = 71

  // Angle from -180deg (left) to 0deg (right)
  const needleAngle = -Math.PI + (clamped / 100) * Math.PI
  const needleLen = 54
  const nx = cx + needleLen * Math.cos(needleAngle)
  const ny = cy + needleLen * Math.sin(needleAngle)

  const badgeTone =
    statusTone === "healthy"
      ? "bg-blue-500/12 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
      : statusTone === "warning"
        ? "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
        : "bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 220 116"
        className={cn(
          "w-full overflow-visible",
          compact ? "max-w-[136px]" : "max-w-[220px]",
        )}
      >
        {Array.from({ length: totalTicks }, (_, i) => {
          const angle = -Math.PI + (i / (totalTicks - 1)) * Math.PI
          const x1 = cx + innerR * Math.cos(angle)
          const y1 = cy + innerR * Math.sin(angle)
          const x2 = cx + outerR * Math.cos(angle)
          const y2 = cy + outerR * Math.sin(angle)
          const active = i < activeTicks
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={
                active
                  ? statusTone === "critical"
                    ? "#f43f5e"
                    : statusTone === "warning"
                      ? "var(--vibe-amber)"
                      : i > totalTicks * 0.72
                        ? "var(--vibe-cyan)"
                        : "var(--vibe-blue)"
                  : "var(--track)"
              }
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )
        })}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="var(--foreground)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={5} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2.5} />
      </svg>
      <div className={cn("flex items-center gap-1.5", compact ? "-mt-1.5" : "-mt-3 flex-col")}>
        <span className={cn("tnum font-bold tracking-tight", compact ? "text-lg leading-none" : "text-2xl")}>
          {clamped}
        </span>
        <span
          className={cn(
            "rounded-full font-semibold",
            compact ? "px-2 py-0.2 text-[10px]" : "mt-1 px-2.5 py-0.5 text-[11px]",
            badgeTone,
          )}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
 * 4. VibeConcentricRings — 3 Concentric Rings ("Team Goals" in Vibe Kit)
 * ============================================================================ */
export function VibeConcentricRings({
  rings,
  size = 112,
}: {
  rings: { label: string; pct: number; color: string }[]
  size?: number
}) {
  const center = size / 2
  const radii = [size / 2 - 7, size / 2 - 18, size / 2 - 29]

  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} className="shrink-0 -rotate-90">
        {rings.slice(0, 3).map((r, i) => {
          const radius = radii[i]
          const circ = 2 * Math.PI * radius
          const clamped = Math.min(100, Math.max(0, r.pct))
          const offset = circ * (1 - clamped / 100)
          return (
            <g key={r.label}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="var(--track)"
                strokeWidth={7.5}
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeWidth={7.5}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
              />
            </g>
          )
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2 text-[11px]">
        {rings.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-1.5">
            <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: r.color }} />
              <span className="whitespace-nowrap">{r.label}</span>
            </span>
            <span className="tnum shrink-0 font-semibold text-foreground">{Math.round(r.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================================================================
 * 5. VibeWorldMap — High-Precision 3D Orthographic Vector Globe & 2,183-Dot Matrix Map
 *    Auto-rotates continuously by default; pauses ONLY when pointer hovers the globe;
 *    never resets rotation on arc connections; clean label-free presentation.
 * ============================================================================ */

const DEG2RAD = Math.PI / 180

/** Project (lon, lat) in degrees onto a 3D Orthographic sphere centered at (lon0, lat0). */
function projectOrtho(
  lon: number,
  lat: number,
  lon0: number,
  lat0: number,
  cx: number,
  cy: number,
  R: number,
): { x: number; y: number; z: number } {
  const lam = (lon - lon0) * DEG2RAD
  const phi = lat * DEG2RAD
  const phi0 = lat0 * DEG2RAD
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const sinPhi0 = Math.sin(phi0)
  const cosPhi0 = Math.cos(phi0)
  const cosLam = Math.cos(lam)
  const sinLam = Math.sin(lam)

  const z = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLam
  const x = cx + R * cosPhi * sinLam
  const y = cy - R * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLam)
  return { x, y, z }
}

/** Convert a country polygon ring into a horizon-clipped SVG path on the front hemisphere. */
function buildGlobeRingPath(
  ring: [number, number][],
  lon0: number,
  lat0: number,
  cx: number,
  cy: number,
  R: number,
): string | null {
  const pts = ring.map(([lon, lat]) => projectOrtho(lon, lat, lon0, lat0, cx, cy, R))
  let visibleCount = 0
  for (const p of pts) {
    if (p.z > 0.01) visibleCount++
  }
  if (visibleCount === 0) return null

  const commands: string[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    let px = p.x
    let py = p.y
    if (p.z < 0) {
      // Clamp horizon-crossing vertices cleanly onto the outer rim circle
      const dx = px - cx
      const dy = py - cy
      const dist = Math.hypot(dx, dy) || 1
      px = cx + (dx / dist) * R
      py = cy + (dy / dist) * R
    }
    commands.push(`${commands.length === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return commands.length >= 3 ? `${commands.join(" ")} Z` : null
}

/** Generate 3D great-circle (geodesic) arc path between two (lon, lat) coordinates on the globe. */
function buildGlobeGeodesicArc(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  lon0: number,
  lat0: number,
  cx: number,
  cy: number,
  R: number,
): string | null {
  const toVec = (lon: number, lat: number): [number, number, number] => {
    const l = lon * DEG2RAD
    const p = lat * DEG2RAD
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
  }
  const v1 = toVec(lon1, lat1)
  const v2 = toVec(lon2, lat2)

  const steps = 22
  const cmds: string[] = []
  let penDown = false
  let visiblePts = 0

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const vx = (1 - t) * v1[0] + t * v2[0]
    const vy = (1 - t) * v1[1] + t * v2[1]
    const vz = (1 - t) * v1[2] + t * v2[2]
    const len = Math.hypot(vx, vy, vz) || 1
    const nx = vx / len
    const ny = vy / len
    const nz = vz / len

    const lat = Math.asin(Math.max(-1, Math.min(1, nz))) / DEG2RAD
    const lon = Math.atan2(ny, nx) / DEG2RAD
    // Subtle 3D altitude arch above the sphere surface
    const lift = 1 + 0.05 * Math.sin(Math.PI * t)
    const pt = projectOrtho(lon, lat, lon0, lat0, cx, cy, R * lift)
    if (pt.z >= 0) {
      visiblePts++
      cmds.push(`${penDown ? "L" : "M"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      penDown = true
    } else {
      penDown = false
    }
  }
  return visiblePts >= 2 ? cmds.join(" ") : null
}

export type CountryCluster = {
  code: string
  name: string
  region: string
  lat: number
  lon: number
  nodes: Node[]
  online: number
  avgCpu: number
}

export function VibeWorldMap({
  nodes,
  mode,
  onSelectNode,
}: {
  nodes: Node[]
  mode: "globe" | "dotted"
  onSelectNode?: (id: number) => void
}) {
  const { lang } = useI18n()
  const uid = useId().replace(/:/g, "")

  // Group nodes by country ISO code
  const { byCountry, locations } = useMemo(() => {
    const map = new Map<string, CountryCluster>()
    for (const n of nodes) {
      const code = (n.country || "UN").toUpperCase()
      const info = countryInfo(code, lang)
      const entry = map.get(code) ?? {
        code,
        name: info.name,
        region: info.region,
        lat: info.lat,
        lon: info.lon,
        nodes: [],
        online: 0,
        avgCpu: 0,
      }
      entry.nodes.push(n)
      if (n.online) entry.online++
      map.set(code, entry)
    }
    for (const entry of map.values()) {
      const reporting = entry.nodes.filter((n) => n.online && n.metrics)
      entry.avgCpu =
        reporting.length > 0
          ? reporting.reduce((s, n) => s + n.metrics!.cpu, 0) / reporting.length
          : 0
    }
    const list = [...map.values()].sort(
      (a, b) => b.nodes.length - a.nodes.length || a.code.localeCompare(b.code),
    )
    return { byCountry: map, locations: list }
  }, [nodes, lang])

  // Deterministic geodesic route pairs between active country hubs (never causes rotation resets)
  const routePairs = useMemo(() => {
    if (locations.length < 2) return []
    const pairs: [CountryCluster, CountryCluster][] = []
    const primary = locations[0]
    for (let i = 1; i < Math.min(locations.length, 7); i++) {
      pairs.push([primary, locations[i]])
    }
    // Add cross-continent ring links so rotating to any hemisphere shows connected routes
    for (let i = 1; i < Math.min(locations.length - 1, 5); i++) {
      pairs.push([locations[i], locations[i + 1]])
    }
    return pairs
  }, [locations])

  // Globe orientation state [lon0, lat0] — auto-rotates continuously by default,
  // pauses ONLY while pointer hovers or drags on the globe SVG, and NEVER resets on data/arc updates.
  const [rotation, setRotation] = useState<[number, number]>([105, 22])
  const [isHoveringGlobe, setIsHoveringGlobe] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; lon0: number; lat0: number } | null>(null)

  useEffect(() => {
    if (mode !== "globe" || isHoveringGlobe || isDragging) return
    const timer = setInterval(() => {
      setRotation(([lon, lat]) => [((lon + 0.6 + 540) % 360) - 180, lat])
    }, 50)
    return () => clearInterval(timer)
  }, [mode, isHoveringGlobe, isDragging])

  /* ==========================================================================
   * MODE A: High-Density 2,183-Dot World Matrix
   * ========================================================================== */
  if (mode === "dotted") {
    const W = 360
    const H = 164
    const projectFlat = (lon: number, lat: number) => {
      const x = ((lon + 170) / 352) * (W - 16) + 8
      const y = ((74 - lat) / 132) * (H - 14) + 7
      return [x, y] as const
    }

    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-xl bg-card-subtle/60 px-1.5 py-1 dark:bg-slate-950/60 dark:ring-1 dark:ring-white/8">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[146px] w-full select-none">
          <defs>
            <radialGradient id={`radar-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--vibe-blue)" stopOpacity={0.38} />
              <stop offset="70%" stopColor="var(--vibe-blue)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--vibe-blue)" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Subtle latitude reference lines */}
          {[-30, 0, 30, 60].map((lat) => {
            const [, y] = projectFlat(0, lat)
            return (
              <line
                key={lat}
                x1={6}
                y1={y}
                x2={W - 6}
                y2={y}
                stroke="var(--globe-graticule)"
                strokeWidth={0.55}
                strokeDasharray="2 4"
              />
            )
          })}

          {/* 2,183 Precision Land Dots */}
          {WORLD_DOT_MATRIX.map(([lon, lat, code], idx) => {
            const [x, y] = projectFlat(lon, lat)
            const cluster = byCountry.get(code)
            if (cluster) {
              const isOffline = cluster.online === 0
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r={1.9}
                  fill={isOffline ? "var(--vibe-amber)" : "var(--vibe-blue)"}
                  opacity={0.9}
                />
              )
            }
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r={1.32}
                fill="var(--map-dot-base)"
              />
            )
          })}

          {/* Geodesic curved dashed arcs */}
          {routePairs.slice(0, 6).map(([a, b]) => {
            const [x1, y1] = projectFlat(a.lon, a.lat)
            const [x2, y2] = projectFlat(b.lon, b.lat)
            const dist = Math.hypot(x2 - x1, y2 - y1)
            const mx = (x1 + x2) / 2
            const my = Math.min(y1, y2) - Math.min(30, dist * 0.2)
            return (
              <path
                key={`d-arc-${a.code}-${b.code}`}
                d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                fill="none"
                stroke="var(--globe-arc)"
                strokeWidth={1.25}
                strokeDasharray="3 3"
                opacity={0.78}
              />
            )
          })}

          {/* Concentric Radar Halos & Glowing Beacons */}
          {locations.map((loc, idx) => {
            const [x, y] = projectFlat(loc.lon, loc.lat)
            const color =
              loc.online === 0
                ? "var(--vibe-amber)"
                : idx === 0
                  ? "var(--vibe-teal)"
                  : "var(--vibe-blue)"
            const haloRadius = Math.min(18, 9 + loc.nodes.length * 1.6)
            return (
              <g
                key={loc.code}
                className="cursor-pointer"
                onClick={() => loc.nodes[0] && onSelectNode?.(loc.nodes[0].id)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={haloRadius}
                  fill={`url(#radar-${uid})`}
                  stroke={color}
                  strokeWidth={0.75}
                  strokeOpacity={0.5}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={3.8}
                  fill={color}
                  stroke="var(--card)"
                  strokeWidth={1.6}
                />
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  /* ==========================================================================
   * MODE B: 3D Orthographic Vector Globe
   *         Auto-spinning by default, pauses ONLY when hovering the globe,
   *         label-free, with stable 3D great-circle arcs.
   * ========================================================================== */
  const cx = 100
  const cy = 100
  const R = 90
  const [lon0, lat0] = rotation

  // Pre-build spherical graticule paths (every 30 deg lon and 30 deg lat)
  const graticulePaths: string[] = []
  for (let lon = -180; lon < 180; lon += 30) {
    const cmds: string[] = []
    for (let lat = -75; lat <= 75; lat += 7.5) {
      const p = projectOrtho(lon, lat, lon0, lat0, cx, cy, R)
      if (p.z >= 0) {
        cmds.push(`${cmds.length === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      } else if (cmds.length > 0) {
        graticulePaths.push(cmds.join(" "))
        cmds.length = 0
      }
    }
    if (cmds.length > 1) graticulePaths.push(cmds.join(" "))
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const cmds: string[] = []
    for (let lon = -180; lon <= 180; lon += 7.5) {
      const p = projectOrtho(lon, lat, lon0, lat0, cx, cy, R)
      if (p.z >= 0) {
        cmds.push(`${cmds.length === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      } else if (cmds.length > 0) {
        graticulePaths.push(cmds.join(" "))
        cmds.length = 0
      }
    }
    if (cmds.length > 1) graticulePaths.push(cmds.join(" "))
  }

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        className={cn(
          "size-[148px] shrink-0 select-none overflow-visible",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onMouseEnter={() => setIsHoveringGlobe(true)}
        onMouseLeave={() => {
          setIsHoveringGlobe(false)
          setIsDragging(false)
          dragRef.current = null
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setIsDragging(true)
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            lon0: rotation[0],
            lat0: rotation[1],
          }
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const dx = e.clientX - dragRef.current.startX
          const dy = e.clientY - dragRef.current.startY
          const nextLon = ((dragRef.current.lon0 - dx * 0.75 + 540) % 360) - 180
          const nextLat = Math.max(-50, Math.min(60, dragRef.current.lat0 + dy * 0.55))
          setRotation([nextLon, nextLat])
        }}
        onPointerUp={() => {
          setIsDragging(false)
          dragRef.current = null
        }}
      >
        <defs>
          <clipPath id={`globe-clip-${uid}`}>
            <circle cx={cx} cy={cy} r={R - 0.3} />
          </clipPath>
          {/* High-Contrast 3D Ocean Sphere Gradient */}
          <radialGradient id={`globe-ocean-${uid}`} cx="34%" cy="26%" r="76%">
            <stop offset="0%" stopColor="var(--globe-ocean-top)" />
            <stop offset="56%" stopColor="var(--globe-ocean-mid)" />
            <stop offset="100%" stopColor="var(--globe-ocean-bottom)" />
          </radialGradient>
          {/* Inner 3D Atmospheric Rim Glow */}
          <radialGradient id={`globe-rim-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="76%" stopColor="var(--vibe-blue)" stopOpacity={0} />
            <stop offset="93%" stopColor="var(--vibe-blue)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--globe-rim)" stopOpacity={0.65} />
          </radialGradient>
        </defs>

        {/* Outer Soft Atmosphere Halo */}
        <circle cx={cx} cy={cy} r={R + 5} fill="var(--globe-halo)" />

        {/* 3D Ocean Sphere Base */}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill={`url(#globe-ocean-${uid})`}
          stroke="var(--globe-rim)"
          strokeWidth={1.5}
        />

        {/* Spherical Graticule Grid (Underneath Continents) */}
        <g clipPath={`url(#globe-clip-${uid})`}>
          {graticulePaths.map((d, i) => (
            <path
              key={`grat-${i}`}
              d={d}
              fill="none"
              stroke="var(--globe-graticule)"
              strokeWidth={0.75}
            />
          ))}

          {/* Real Vector Country Polygons with High-Clarity Choropleth Highlighting */}
          {WORLD_COUNTRIES.map((country) => {
            const cluster = byCountry.get(country.c)
            const paths: string[] = []
            for (const ring of country.r) {
              const d = buildGlobeRingPath(ring, lon0, lat0, cx, cy, R)
              if (d) paths.push(d)
            }
            if (paths.length === 0) return null

            let fillColor = "var(--globe-land)"
            let fillOpacity = 1
            let strokeColor = "var(--globe-land-stroke)"
            let strokeWidth = 0.72

            if (cluster) {
              strokeColor = "var(--globe-active-stroke)"
              strokeWidth = 0.9
              if (cluster.online === 0) {
                fillColor = "var(--vibe-amber)"
                fillOpacity = 0.75
              } else if (cluster.nodes.length >= 2) {
                fillColor = "var(--globe-active-focused)"
                fillOpacity = 0.9
              } else {
                fillColor = "var(--globe-active)"
                fillOpacity = 0.78
              }
            }

            return (
              <path
                key={country.c}
                d={paths.join(" ")}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                className={cn(
                  cluster ? "cursor-pointer transition-opacity hover:opacity-100" : "",
                )}
                onClick={() => cluster?.nodes[0] && onSelectNode?.(cluster.nodes[0].id)}
              />
            )
          })}

          {/* Subtle Graticule Overlay on Top of Continents */}
          {graticulePaths.map((d, i) => (
            <path
              key={`grat-top-${i}`}
              d={d}
              fill="none"
              stroke="var(--globe-graticule-top)"
              strokeWidth={0.45}
              className="pointer-events-none"
            />
          ))}

          {/* 3D Atmospheric Rim Shading */}
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill={`url(#globe-rim-${uid})`}
            className="pointer-events-none"
          />
        </g>

        {/* Stable 3D Great-Circle Geodesic Dashed Arcs */}
        {routePairs.map(([a, b]) => {
          const pa = projectOrtho(a.lon, a.lat, lon0, lat0, cx, cy, R)
          const pb = projectOrtho(b.lon, b.lat, lon0, lat0, cx, cy, R)
          if (pa.z < 0.02 && pb.z < 0.02) return null
          const arcPath = buildGlobeGeodesicArc(
            a.lon,
            a.lat,
            b.lon,
            b.lat,
            lon0,
            lat0,
            cx,
            cy,
            R,
          )
          if (!arcPath) return null
          return (
            <path
              key={`g-arc-${a.code}-${b.code}`}
              d={arcPath}
              fill="none"
              stroke="var(--globe-arc)"
              strokeWidth={1.45}
              strokeDasharray="3.5 3"
              strokeLinecap="round"
              opacity={0.9}
              className="pointer-events-none"
            />
          )
        })}

        {/* Active Server Beacons on Visible Hemisphere */}
        {locations.map((loc) => {
          const pt = projectOrtho(loc.lon, loc.lat, lon0, lat0, cx, cy, R)
          if (pt.z < 0) return null
          const color =
            loc.online === 0
              ? "var(--vibe-amber)"
              : loc.avgCpu >= 75
                ? "var(--vibe-cyan)"
                : "var(--vibe-teal)"
          return (
            <g
              key={loc.code}
              className="cursor-pointer"
              onClick={() => loc.nodes[0] && onSelectNode?.(loc.nodes[0].id)}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={8.5}
                fill={color}
                opacity={0.24}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4.2}
                fill={color}
                stroke="var(--globe-active-stroke)"
                strokeWidth={1.8}
              />
            </g>
          )
        })}

        {/* Crisp Luminous Outer Sphere Rim */}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="var(--globe-rim)"
          strokeWidth={1.5}
          className="pointer-events-none"
        />
      </svg>
    </div>
  )
}



