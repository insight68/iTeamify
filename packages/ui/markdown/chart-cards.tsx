import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ExternalLink } from 'lucide-react'

type ChartKind = 'line' | 'bar' | 'area'

interface ChartSeries {
  key: string
  label?: string
  color?: string
}

interface NativeChartSpec {
  type?: ChartKind
  title?: string
  xKey?: string
  series?: ChartSeries[]
  data?: Array<Record<string, string | number | null>>
  height?: number
}

interface EmbedSpec {
  provider?: string
  title?: string
  url?: string
  height?: number
}

const CHART_CARD_RE = /^!chart\[((?:\\.|[^\]])*)\]\((\{.*\})\)$/
const EMBED_CARD_RE = /^!embed\[((?:\\.|[^\]])*)\]\((\{.*\})\)$/
const MAX_CHART_HEIGHT = 640
const MIN_CHART_HEIGHT = 180
const DEFAULT_CHART_HEIGHT = 280
const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function unescapeCardLabel(s: string): string {
  return s.replace(/\\]/g, ']').replace(/\\\\/g, '\\')
}

function clampHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CHART_HEIGHT
  return Math.max(MIN_CHART_HEIGHT, Math.min(MAX_CHART_HEIGHT, Math.round(value)))
}

function toCardHtml(kind: 'chartCard' | 'embedCard', title: string, spec: string): string {
  return `<div data-type="${kind}" data-title="${escapeAttr(title)}" data-spec="${escapeAttr(spec)}"></div>`
}

export function preprocessChartCards(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      const chartMatch = trimmed.match(CHART_CARD_RE)
      if (chartMatch) {
        return toCardHtml('chartCard', unescapeCardLabel(chartMatch[1] ?? ''), chartMatch[2] ?? '{}')
      }
      const embedMatch = trimmed.match(EMBED_CARD_RE)
      if (embedMatch) {
        return toCardHtml('embedCard', unescapeCardLabel(embedMatch[1] ?? ''), embedMatch[2] ?? '{}')
      }
      return line
    })
    .join('\n')
}

function parseSpec<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizedAllowedHosts(domains: string[]): Set<string> {
  const hosts = new Set<string>()
  for (const domain of domains) {
    const trimmed = domain.trim()
    if (!trimmed) continue
    try {
      const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
      hosts.add(u.hostname.toLowerCase())
    } catch {
      hosts.add(trimmed.toLowerCase())
    }
  }
  return hosts
}

function isAllowedEmbedUrl(raw: string, allowedDomains: string[]): boolean {
  if (!/^https?:\/\//i.test(raw)) return false
  const allowed = normalizedAllowedHosts(allowedDomains)
  if (allowed.size === 0) return false
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return allowed.has(host)
  } catch {
    return false
  }
}

export function ChartCard({ title, spec: rawSpec }: { title: string; spec: string }): React.ReactNode {
  const spec = parseSpec<NativeChartSpec>(rawSpec)
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) return null

  const xKey = typeof spec.xKey === 'string' && spec.xKey ? spec.xKey : 'x'
  const series = Array.isArray(spec.series)
    ? spec.series.filter((s): s is ChartSeries => typeof s?.key === 'string' && s.key.length > 0).slice(0, 5)
    : []
  if (series.length === 0) return null

  const chartTitle = title || spec.title || ''
  const height = clampHeight(spec.height)
  const kind: ChartKind = spec.type === 'bar' || spec.type === 'area' ? spec.type : 'line'
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} minTickGap={24} />
      <YAxis tickLine={false} axisLine={false} width={36} />
      <Tooltip />
      <Legend />
    </>
  )

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-background">
      {chartTitle && (
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          {chartTitle}
        </div>
      )}
      <div className="p-2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart data={spec.data}>
              {common}
              {series.map((s, index) => (
                <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : kind === 'area' ? (
            <AreaChart data={spec.data}>
              {common}
              {series.map((s, index) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]} fill={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]} fillOpacity={0.16} />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={spec.data}>
              {common}
              {series.map((s, index) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function EmbedCard({
  title,
  spec: rawSpec,
  allowedDomains,
}: {
  title: string
  spec: string
  allowedDomains: string[]
}): React.ReactNode {
  const spec = parseSpec<EmbedSpec>(rawSpec)
  const url = spec?.url ?? ''
  if (!url) return null

  const embedTitle = title || spec?.title || spec?.provider || url
  const height = clampHeight(spec?.height)
  const safeHref = /^https?:\/\//i.test(url) ? url : ''
  if (!isAllowedEmbedUrl(url, allowedDomains)) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{embedTitle}</span>
        {safeHref && (
          <a
            className="shrink-0 text-muted-foreground hover:text-foreground"
            href={safeHref}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
        <span className="min-w-0 flex-1 truncate">{embedTitle}</span>
        <a className="shrink-0 text-muted-foreground hover:text-foreground" href={safeHref} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" />
        </a>
      </div>
      <iframe
        title={embedTitle}
        src={url}
        className="block w-full bg-background"
        style={{ height }}
        loading="lazy"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
      />
    </div>
  )
}
