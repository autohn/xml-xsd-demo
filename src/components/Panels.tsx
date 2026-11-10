import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import type { ElementInst, Issue, SchemaSet } from '@/xsd/model'
import { pathKey } from '@/xsd/instance'
import { highlightXml } from '@/lib/highlight'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* ─────────────── XML preview ─────────────── */

export function XmlPreview({ xml, error }: { xml: string; error?: string }) {
  const html = useMemo(() => highlightXml(xml), [xml])
  if (error) {
    return (
      <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-medium">Не удалось собрать XML</p>
        <p className="mt-1 font-mono text-xs break-words">{error}</p>
      </div>
    )
  }
  return (
    <pre className="max-h-[calc(100dvh-16rem)] min-h-40 overflow-auto rounded-2xl border-2 border-border bg-gm-bg0 p-4 font-mono text-[12.5px] leading-relaxed" tabIndex={0}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}

/* ─────────────── Issues ─────────────── */

/** Human breadcrumb for a path: element names along the way + the leaf kind. */
export function describePath(root: ElementInst, issue: Issue): string {
  const names: string[] = [root.decl.name]
  let node: any = root
  for (const step of issue.path) {
    node = node?.[step as any]
    if (node && typeof node === 'object' && node.t === 'el' && node !== root) names.push(node.decl.name)
  }
  const last = issue.path[issue.path.length - 1]
  const prev = issue.path[issue.path.length - 2]
  let tail = ''
  if (prev === 'attrs') tail = ` @${String(last).replace(/^\{.*\}/, '')}`
  return names.slice(-4).join(' › ') + tail
}

export function IssuesList({ root, issues, onPick }: { root: ElementInst; issues: Issue[]; onPick: (issue: Issue) => void }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-success/50 bg-success/10 p-4 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <div>
          <p className="font-medium">Ошибок не найдено</p>
          <p className="text-xs text-muted-foreground">Все значения и количество вхождений соответствуют схеме.</p>
        </div>
      </div>
    )
  }
  return (
    <ul className="max-h-[calc(100dvh-16rem)] space-y-1.5 overflow-auto pr-1">
      {issues.map((issue, i) => (
        <li key={pathKey(issue.path) + i}>
          <button
            type="button"
            onClick={() => onPick(issue)}
            className="group flex w-full cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-border bg-card px-3 py-2 text-left transition-colors hover:border-destructive/70 hover:bg-destructive/10"
          >
            <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="min-w-0">
              <span className="block text-sm leading-snug">{issue.message}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{describePath(root, issue)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ─────────────── Schema info ─────────────── */

export function SchemaInfo({ set }: { set: SchemaSet }) {
  const icon = { info: Info, warning: AlertTriangle, error: OctagonAlert } as const
  const tone = { info: 'text-gm-blue', warning: 'text-primary', error: 'text-destructive' } as const
  return (
    <div className="max-h-[calc(100dvh-16rem)] space-y-4 overflow-auto pr-1">
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Файлов схем', set.stats.files],
          ['Элементов', set.stats.elementDecls],
          ['Сложных типов', set.stats.complexTypes],
          ['Простых типов', set.stats.simpleTypes],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border-2 border-border bg-card px-3 py-2">
            <p className="font-mono text-xl font-semibold text-primary">{v}</p>
            <p className="text-xs text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Загруженные файлы</p>
        <ul className="space-y-1">
          {set.files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-1.5 text-sm">
              <span className="font-mono text-[13px]">{f.name}</span>
              <span className="truncate text-xs text-muted-foreground" title={f.targetNamespace}>
                {f.targetNamespace || 'без namespace'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Замечания к схеме <Badge>{set.diagnostics.length}</Badge>
        </p>
        {set.diagnostics.length === 0 && <p className="text-sm text-muted-foreground">Замечаний нет.</p>}
        <ul className="space-y-1.5">
          {set.diagnostics.slice(0, 80).map((d, i) => {
            const Icon = icon[d.level]
            return (
              <li key={i} className="flex items-start gap-2 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm">
                <Icon className={cn('mt-0.5 size-4 shrink-0', tone[d.level])} />
                <span className="min-w-0">
                  <span className="block leading-snug">{d.message}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{d.file}</span>
                </span>
              </li>
            )
          })}
          {set.diagnostics.length > 80 && <li className="text-xs text-muted-foreground">…и ещё {set.diagnostics.length - 80}</li>}
        </ul>
        {set.stats.unsupported.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Не поддерживается: {set.stats.unsupported.join(', ')}</p>}
      </div>
    </div>
  )
}
