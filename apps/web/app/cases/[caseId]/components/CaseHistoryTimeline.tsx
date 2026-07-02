"use client"
import { useEffect, useState } from "react"
import { Timeline, Icon, Eyebrow, statusFamily, statusLabel } from "@/interfaces/components/ui"

interface TransitionRow {
  id: string
  fromStatus: string
  toStatus: string
  actor: string
  reason: string | null
  createdAt: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

/**
 * Histórico real do caso a partir do CaseTransitionLog. Colapsável para não
 * competir com o progresso de 6 etapas no topo do rail.
 *
 * `refreshKey` muda quando o status do caso muda → re-busca o histórico.
 */
export function CaseHistoryTimeline({
  caseId,
  refreshKey,
  onLoaded,
}: {
  caseId: string
  refreshKey?: string
  /** Sinaliza ao pai que o primeiro fetch terminou (para revelar o rail de uma vez). */
  onLoaded?: () => void
}) {
  const [transitions, setTransitions] = useState<TransitionRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/v1/cases/${caseId}/transitions`)
      .then((r) => (r.ok ? r.json() : { transitions: [] }))
      .then((body) => {
        if (active) setTransitions(Array.isArray(body.transitions) ? body.transitions : [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true)
        onLoaded?.()
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, refreshKey])

  if (!loaded || transitions.length === 0) return null

  // Mais recente primeiro na exibição.
  const items = [...transitions].reverse().map((t, idx) => ({
    title: statusLabel(t.toStatus),
    detail: t.reason ?? undefined,
    by: t.actor,
    time: formatDate(t.createdAt),
    family: statusFamily(t.toStatus),
    current: idx === 0,
  }))

  return (
    <div className="mt-5" data-testid="case-history">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <Eyebrow>Histórico do caso</Eyebrow>
        <span className="flex items-center gap-1 text-[11px] font-medium text-green-700">
          <Icon name={open ? "minus" : "plus"} size={12} />
          {open ? "Ocultar" : `${transitions.length} evento${transitions.length > 1 ? "s" : ""}`}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <Timeline dense items={items} />
        </div>
      )}
    </div>
  )
}
