import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Issue, Path } from '@/xsd/model'
import { pathKey } from '@/xsd/instance'

/**
 * Tiny external store for everything that is NOT the form data itself (validation results, touched fields,
 * expand/collapse commands). Components subscribe with selectors returning primitives, so a keystroke only
 * re-renders the fields whose own status actually changed.
 */
export interface FormStatus {
  issues: Map<string, Issue[]>
  /** number of issues inside the subtree of every path prefix */
  counts: Map<string, number>
  showAll: boolean
  touched: ReadonlySet<string>
  reveal: { key: string; nonce: number } | null
  expand: { mode: 'open' | 'close'; nonce: number } | null
}

export function emptyStatus(): FormStatus {
  return { issues: new Map(), counts: new Map(), showAll: false, touched: new Set(), reveal: null, expand: null }
}

export function buildCounts(issues: Issue[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const issue of issues) {
    for (let k = 0; k <= issue.path.length; k++) {
      const key = pathKey(issue.path.slice(0, k))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

export class StatusStore {
  state: FormStatus = emptyStatus()
  private listeners = new Set<() => void>()
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  set(patch: Partial<FormStatus>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }
  touch(key: string) {
    if (this.state.touched.has(key)) return
    this.set({ touched: new Set(this.state.touched).add(key) })
  }
}

export function useStatus<T>(store: StatusStore, selector: (s: FormStatus) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.state))
}

export interface FormActions {
  store: StatusStore
  /** apply `fn` to the node at `path` of the instance tree */
  update: (path: Path, fn: (old: any) => any) => void
  prefixes: Record<string, string>
}

export const FormActionsCtx = createContext<FormActions | null>(null)

export function useForm(): FormActions {
  const ctx = useContext(FormActionsCtx)
  if (!ctx) throw new Error('FormActionsCtx is missing')
  return ctx
}

/** Error text for a field: shown after the field is touched or when "show all" is on. '' when none/hidden. */
export function fieldError(s: FormStatus, key: string): string {
  if (!s.showAll && !s.touched.has(key)) return ''
  return s.issues.get(key)?.[0]?.message ?? ''
}

export const fieldDomId = (key: string) => `f:${key}`
