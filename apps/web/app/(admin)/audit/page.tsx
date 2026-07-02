"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { TopBar, Select, Input, Button, Eyebrow, Badge } from "@/interfaces/components/ui"

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"])
const PAGE = 50

interface AuditEntry {
  id: string
  action: string
  triggeredBy: string
  caseId: string | null
  details: unknown
  aiReasoning: unknown
  createdAt: string
  user: { name: string; email: string } | null
}

function fmt(ts: string): string {
  return new Date(ts).toLocaleString("pt-BR")
}

export default function AuditPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isAdmin = ADMIN_ROLES.has(session?.user?.role ?? "")

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [action, setAction] = useState("")
  const [caseId, setCaseId] = useState("")
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (status === "authenticated" && !isAdmin) router.replace("/dashboard")
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(PAGE), skip: String(skip) })
    if (action) params.set("action", action)
    if (caseId) params.set("caseId", caseId)
    const res = await fetch(`/api/v1/admin/audit?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
      if (data.actions) setActions(data.actions)
    }
    setLoading(false)
  }, [skip, action, caseId])

  useEffect(() => {
    load()
  }, [load])

  if (status !== "authenticated" || !isAdmin) return null

  const pageStart = total === 0 ? 0 : skip + 1
  const pageEnd = Math.min(skip + PAGE, total)

  return (
    <>
      <TopBar title="Trilha de auditoria" subtitle={`${total} evento(s) registrado(s)`} />

      <div className="flex-1 overflow-auto bg-bone-50 px-4 py-6 md:px-8">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Select
              label="Ação"
              value={action}
              onChange={(e) => {
                setSkip(0)
                setAction(e.target.value)
              }}
            >
              <option value="">Todas as ações</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-64">
            <Input
              label="Caso (ID)"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="Filtrar por caseId"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setSkip(0); load() }}>
            Filtrar
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-400">Carregando…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-lg bg-surface p-12 text-center shadow-hair">
            <p className="text-sm font-medium text-ink-700">Nenhum evento de auditoria</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-hair">
            <div className="grid min-w-[720px] grid-cols-[160px_1fr_180px_120px] gap-4 border-b border-divider bg-bone-50 px-5 py-3">
              <Eyebrow>Quando</Eyebrow>
              <Eyebrow>Ação</Eyebrow>
              <Eyebrow>Por</Eyebrow>
              <Eyebrow>Caso</Eyebrow>
            </div>
            <div className="divide-y divide-divider">
              {entries.map((e) => {
                const hasDetails = e.details != null || e.aiReasoning != null
                const open = expanded === e.id
                return (
                  <div key={e.id}>
                    <button
                      type="button"
                      onClick={() => hasDetails && setExpanded(open ? null : e.id)}
                      className="grid w-full min-w-[720px] grid-cols-[160px_1fr_180px_120px] gap-4 px-5 py-3 text-left transition-colors hover:bg-bone-50"
                    >
                      <span className="font-mono text-xs text-ink-500">{fmt(e.createdAt)}</span>
                      <span className="flex items-center gap-2 text-sm text-ink-900">
                        <Badge tone="neutral">{e.action}</Badge>
                        {hasDetails && (
                          <span className="text-xs text-ink-400">{open ? "▲" : "▼"}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-ink-600">
                        {e.user ? e.user.name : e.triggeredBy}
                      </span>
                      <span className="truncate font-mono text-xs text-ink-500">
                        {e.caseId ?? "—"}
                      </span>
                    </button>
                    {open && hasDetails && (
                      <pre className="overflow-x-auto border-t border-divider bg-ink-900 px-5 py-3 text-xs leading-relaxed text-bone-100">
                        {JSON.stringify({ details: e.details, aiReasoning: e.aiReasoning }, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {total > PAGE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-ink-500">
              {pageStart}–{pageEnd} de {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - PAGE))}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pageEnd >= total}
                onClick={() => setSkip(skip + PAGE)}
              >
                Próximo
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
