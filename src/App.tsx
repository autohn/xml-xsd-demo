import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCheck, ChevronsDownUp, ChevronsUpDown, Download, FileUp, FileCode2, Moon, RotateCcw, Sparkles, Sun, TriangleAlert, Wand2,
} from 'lucide-react'
import type { ElementInst, Issue, RootChoice, SchemaSet } from '@/xsd/model'
import { createElementInst, countInsts, pathKey, updateIn } from '@/xsd/instance'
import { issuesByPath, validateInstance } from '@/xsd/validate'
import { serializeXml, parseXml } from '@/xsd/xml'
import { fillSample, type FillOptions } from '@/xsd/sample'
import { loadSchema, sampleXmlFor, schemaNames } from '@/lib/schemas'
import { FormActionsCtx, StatusStore, buildCounts, fieldDomId, useStatus, type FormActions } from '@/form/store'
import { ElementView, plural } from '@/form/FormTree'
import { IssuesList, SchemaInfo, XmlPreview } from '@/components/Panels'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger, TooltipProvider } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { shortTitle } from '@/form/labels'

const THEME_KEY = 'xsd-demo-theme'

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved) return saved === 'dark'
  } catch {
    /* storage may be blocked */
  }
  return typeof matchMedia === 'function' ? !matchMedia('(prefers-color-scheme: light)').matches : true
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/xml;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function scrollToKey(key: string) {
  let k = key
  for (;;) {
    const el = document.getElementById(fieldDomId(k))
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (/^(INPUT|TEXTAREA|BUTTON)$/.test(el.tagName)) (el as HTMLElement).focus({ preventScroll: true })
      else el.querySelector<HTMLElement>('input,textarea,[role=combobox]')?.focus({ preventScroll: true })
      return
    }
    const i = k.lastIndexOf('/')
    if (i < 0) return
    k = k.slice(0, i)
  }
}

export default function App() {
  const [dark, setDark] = useState(initialDark)
  const [schemaName, setSchemaName] = useState(schemaNames[0] ?? '')
  const [set, setSet] = useState<SchemaSet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rootId, setRootId] = useState<string>('')
  const [inst, setInst] = useState<ElementInst | null>(null)
  const [tab, setTab] = useState('xml')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const store = useMemo(() => new StatusStore(), [])
  const showAll = useStatus(store, (s) => s.showAll)
  const issueTone = showAll ? 'destructive' : 'primary'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const resetStatus = useCallback(() => store.set({ showAll: false, touched: new Set(), reveal: null, expand: null }), [store])

  /* load schema when the file changes */
  useEffect(() => {
    let cancelled = false
    setSet(null)
    setInst(null)
    setLoadError(null)
    loadSchema(schemaName)
      .then((s) => {
        if (cancelled) return
        setSet(s)
        const first = s.roots.find((r) => r.kind === 'element') ?? s.roots[0]
        setRootId(first?.id ?? '')
        resetStatus()
        setInst(first ? createElementInst(first.decl) : null)
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [schemaName, resetStatus])

  const root: RootChoice | undefined = set?.roots.find((r) => r.id === rootId)

  const pickRoot = (id: string) => {
    const r = set?.roots.find((x) => x.id === id)
    if (!r) return
    setRootId(id)
    resetStatus()
    setInst(createElementInst(r.decl))
  }

  const update = useCallback((path: ReadonlyArray<string | number>, fn: (old: any) => any) => {
    setInst((cur) => (cur ? updateIn(cur, path, fn) : cur))
  }, [])

  const deferred = useDeferredValue(inst)
  const issues: Issue[] = useMemo(() => (deferred ? validateInstance(deferred) : []), [deferred])
  useEffect(() => {
    store.set({ issues: issuesByPath(issues), counts: buildCounts(issues) })
  }, [issues, store])

  const xml = useMemo(() => {
    if (!deferred || !set) return { text: '', error: undefined as string | undefined }
    try {
      return { text: serializeXml(deferred, set), error: undefined }
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : String(e) }
    }
  }, [deferred, set])

  const actions: FormActions | null = useMemo(() => (set ? { store, update, prefixes: set.prefixes } : null), [set, store, update])

  /* ───────── toolbar actions ───────── */
  const runCheck = () => {
    store.set({ showAll: true })
    setTab('issues')
    if (issues.length === 0) setNotice({ tone: 'ok', text: 'Проверка пройдена — ошибок нет.' })
    else window.setTimeout(() => scrollToKey(pathKey(issues[0].path)), 0)
  }

  const doDownload = () => {
    if (!inst || !set) return
    const text = serializeXml(inst, set)
    download(text, `${inst.decl.name}.xml`)
    setNotice({ tone: 'ok', text: `Файл ${inst.decl.name}.xml сформирован и скачивается.` })
  }

  const onDownload = () => {
    store.set({ showAll: true })
    if (issues.length > 0) {
      setConfirmOpen(true)
      setTab('issues')
    } else doDownload()
  }

  const onFill = (opts: FillOptions) => {
    if (!inst) return
    setInst(fillSample(inst, opts))
    resetStatus()
    setNotice({ tone: 'ok', text: 'Форма заполнена примерными значениями.' })
  }

  const applyXml = (text: string, label: string) => {
    if (!set || !root) return
    try {
      const res = parseXml(text, set, root)
      setInst(res.root)
      resetStatus()
      store.set({ showAll: true })
      setNotice({
        tone: res.warnings.length ? 'warn' : 'ok',
        text: res.warnings.length ? `${label}: загружено, замечаний при разборе — ${res.warnings.length} (${res.warnings[0]})` : `${label}: загружено без замечаний.`,
      })
    } catch (e) {
      setNotice({ tone: 'warn', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    applyXml(await f.text(), f.name)
    if (fileRef.current) fileRef.current.value = ''
  }

  const sample = sampleXmlFor(schemaName)
  const rootOptions: ComboOption[] = useMemo(
    () =>
      (set?.roots ?? []).map((r) => ({
        value: r.id,
        label: r.kind === 'element' ? `<${r.label}>` : r.label,
        hint: shortTitle(r.doc, '', 120) || undefined,
        group: r.kind === 'element' ? 'Элементы' : 'Типы',
      })),
    [set],
  )

  const formCount = inst ? countInsts(inst) : 0

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col gap-4 px-4 pb-24 sm:px-6">
        {/* ───────── header ───────── */}
        <header className="sticky top-0 z-30 -mx-4 border-b-2 border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-3">
              <div className="retro-surface flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <FileCode2 className="size-6" strokeWidth={2.4} />
              </div>
              <div className="leading-tight">
                <h1 className="text-lg font-semibold">XSD → форма → XML</h1>
                <p className="font-mono text-[11px] text-muted-foreground">динамический генератор форм</p>
              </div>
            </div>

            <div className="order-last flex basis-full flex-col gap-3 sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full sm:w-60">
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="schema-select">
                  Схема (XSD)
                </label>
                <Select value={schemaName} onValueChange={setSchemaName}>
                  <SelectTrigger id="schema-select" className="font-mono text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {schemaNames.map((n) => (
                      <SelectItem key={n} value={n} className="font-mono text-[13px]">
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-80">
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="root-select">
                  Корень формы {set && <span className="font-mono opacity-70">· {set.roots.length}</span>}
                </label>
                <Combobox id="root-select" options={rootOptions} value={rootId} onChange={pickRoot} placeholder="Загрузка…" searchPlaceholder="Найти элемент или тип…" className="font-mono text-[13px]" />
              </div>
            </div>

            <Button className="ml-auto sm:ml-0" variant="outline" size="icon" onClick={() => setDark((d) => !d)} aria-label={dark ? 'Светлая тема' : 'Тёмная тема'} title={dark ? 'Светлая тема' : 'Тёмная тема'}>
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>

        {/* ───────── toolbar ───────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" disabled={!inst}>
                <Wand2 /> Заполнить примером
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-1.5 p-2">
              {(
                [
                  ['Только обязательное', 'none'],
                  ['Обязательное + часть необязательного', 'some'],
                  ['Всё, что есть в схеме (до глубины 6)', 'all'],
                ] as const
              ).map(([label, optional]) => (
                <Button key={optional} variant="ghost" className="w-full justify-start" onClick={() => onFill({ optional, maxDepth: optional === 'all' ? 6 : 8 })}>
                  <Sparkles /> {label}
                </Button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" disabled={!inst}>
                <FileUp /> Загрузить XML
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-1.5 p-2">
              <Button variant="ghost" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                <FileUp /> Выбрать файл…
              </Button>
              {sample && (
                <Button variant="ghost" className="w-full justify-start" onClick={async () => applyXml(await sample.load(), sample.name)}>
                  <FileCode2 /> <span className="truncate">Пример: {sample.name}</span>
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <input ref={fileRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          <Button variant="ghost" size="icon" title="Развернуть всё" aria-label="Развернуть всё" onClick={() => store.set({ expand: { mode: 'open', nonce: Date.now() } })}>
            <ChevronsUpDown />
          </Button>
          <Button variant="ghost" size="icon" title="Свернуть всё" aria-label="Свернуть всё" onClick={() => store.set({ expand: { mode: 'close', nonce: Date.now() } })}>
            <ChevronsDownUp />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (!root) return
              setInst(createElementInst(root.decl))
              resetStatus()
            }}
            disabled={!root}
          >
            <RotateCcw /> Сбросить
          </Button>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={runCheck} disabled={!inst}>
              <CheckCheck /> Проверить
              {issues.length > 0 && <Badge variant={issueTone}>{issues.length}</Badge>}
            </Button>
            <Button size="lg" className="flex-1 sm:flex-none" onClick={onDownload} disabled={!inst}>
              <Download /> Скачать XML
            </Button>
          </div>
        </div>

        {/* ───────── body ───────── */}
        {loadError && (
          <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Не удалось загрузить схему</p>
            <p className="mt-1 font-mono text-xs">{loadError}</p>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,36%)]">
          <main className="min-w-0 space-y-3">
            {!set && !loadError && <LoadingCard name={schemaName} />}
            {set && inst && actions && (
              <FormActionsCtx.Provider value={actions}>
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                  <span className="font-mono">{schemaName}</span>
                  <span>›</span>
                  <span className="font-mono text-foreground">{root?.kind === 'element' ? `<${root.label}>` : root?.label}</span>
                  <Badge>{formCount} эл. в форме</Badge>
                  {issues.length > 0 && (
                    <Badge variant={issueTone}>
                      {issues.length} {plural(issues.length, 'замечание', 'замечания', 'замечаний')}
                    </Badge>
                  )}
                </div>
                {/* key=root id so a root switch remounts local open/closed state */}
                <ElementView key={rootId} inst={inst} pk="" path={[]} slotPath={[]} depth={0} required ctlMode="none" index={0} len={1} canRemove={false} canAdd={false} />
              </FormActionsCtx.Provider>
            )}
          </main>

          <aside className="min-w-0 lg:sticky lg:top-[5.5rem]">
            <Tabs value={tab} onValueChange={setTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="xml">XML</TabsTrigger>
                <TabsTrigger value="issues">
                  Проверка
                  {issues.length > 0 && <Badge variant={issueTone}>{issues.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="schema">Схема</TabsTrigger>
              </TabsList>
              <TabsContent value="xml">
                <XmlPreview xml={xml.text} error={xml.error} />
              </TabsContent>
              <TabsContent value="issues">
                {inst && (
                  <IssuesList
                    root={inst}
                    issues={issues}
                    onPick={(issue) => {
                      store.set({ showAll: true, reveal: { key: pathKey(issue.path), nonce: Date.now() } })
                      window.setTimeout(() => scrollToKey(pathKey(issue.path)), 80)
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="schema">{set ? <SchemaInfo set={set} /> : <p className="text-sm text-muted-foreground">Схема загружается…</p>}</TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>

      {/* confirm download with issues */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-primary" /> В форме есть ошибки
            </DialogTitle>
            <DialogDescription>
              Найдено {issues.length} {plural(issues.length, 'замечание', 'замечания', 'замечаний')} по схеме. XML, скорее всего, не пройдёт валидацию на стороне получателя. Скачать всё равно?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); window.setTimeout(() => issues[0] && scrollToKey(pathKey(issues[0].path)), 120) }}>
              Исправить
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false)
                doDownload()
              }}
            >
              <Download /> Скачать как есть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* toast */}
      {notice && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2">
          <div className={`retro-surface flex items-start gap-3 rounded-2xl bg-popover px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-success/60' : 'border-primary/70'}`}>
            {notice.tone === 'ok' ? <CheckCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />}
            <span className="min-w-0 break-words">{notice.text}</span>
          </div>
        </div>
      )}
    </TooltipProvider>
  )
}

function LoadingCard({ name }: { name: string }) {
  return (
    <div className="space-y-3" aria-busy>
      <p className="px-1 font-mono text-xs text-muted-foreground">Разбираю {name}…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl border-2 border-border bg-card" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  )
}
