"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { TopBar, Button, RiskBadge, StatusChip } from "@/interfaces/components/ui"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggeredRule = {
  ruleId: string
  ruleName: string
  reason: string
}

type EvaluationResult = {
  riskLevel: string
  triageScore: number
  requiresART: boolean | string
  requiresHumanReview: boolean
  mandatoryInspection: boolean
  triggeredRules: TriggeredRule[]
}

type ReformScope = {
  description?: string
  services?: string[]
  estimatedArea?: number
  estimatedDurationDays?: number
}

type CaseDetail = {
  id: string
  protocol: string
  status: string
  riskLevel: string | null
  triageScore: number | null
  requiresART: boolean | null
  reformScope: ReformScope | null
  evaluationResult: EvaluationResult | null
  unit: {
    id: string
    identifier: string
    block: string | null
    floor: string | null
  } | null
  client: {
    id: string
    name: string
    email: string
  } | null
  partner: {
    id: string
    user: { name: string }
  } | null
  createdAt: string
}

/** Estados a partir dos quais o síndico pode encaminhar ao parceiro técnico. */
const ASSIGNABLE_STATUSES = new Set([
  "ELIGIBLE_FOR_RELEASE",
  "RELEASED_WITH_CONDITIONS",
  "AWAITING_PAYMENT",
])

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SindicoCaseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const caseId = params?.caseId as string

  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form state for approval/rejection
  const [comment, setComment] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<"approve" | "reject" | null>(null)

  useEffect(() => {
    if (!caseId) return
    fetch(`/api/v1/cases/${caseId}`)
      .then(async (res) => {
        if (res.status === 401) { router.push("/login"); return }
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) { setNotFound(true); return }
        const data = await res.json()
        setCaseData(data.case ?? data)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [caseId, router])

  const isPendingApproval = caseData?.status === "AWAITING_SYNDIC_APPROVAL"
  const canAssignPartner =
    !!caseData && !caseData.partner && ASSIGNABLE_STATUSES.has(caseData.status)

  async function handleAssignPartner() {
    if (!caseData) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/assign-partner`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(
          data.message ??
            (data.error === "NOT_FOUND"
              ? "Nenhum parceiro disponível. Defina o parceiro técnico do condomínio em “Parceiro técnico”."
              : "Erro ao atribuir o parceiro."),
        )
        return
      }
      const refreshed = await fetch(`/api/v1/cases/${caseId}`)
      if (refreshed.ok) setCaseData(await refreshed.json())
    } catch {
      setError("Erro inesperado. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove() {
    if (!caseData) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/syndic-review/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? data.error ?? "Erro ao aprovar o caso.")
        return
      }
      router.push("/sindico/cases?approved=1")
    } catch {
      setError("Erro inesperado. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!caseData) return
    setError(null)
    if (!reason.trim() || reason.trim().length < 10) {
      setError("O motivo da recusa deve ter no mínimo 10 caracteres.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/syndic-review/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? data.error ?? "Erro ao recusar o caso.")
        return
      }
      router.push("/sindico/cases?rejected=1")
    } catch {
      setError("Erro inesperado. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Detalhe do caso" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ink-400">Carregando...</p>
        </div>
      </div>
    )
  }

  if (notFound || !caseData) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Detalhe do caso" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-ink-700 font-medium">Caso não encontrado.</p>
            <button
              type="button"
              onClick={() => router.push("/sindico/cases")}
              className="mt-3 text-sm font-medium text-azulejo-700 hover:underline"
            >
              Voltar para a lista
            </button>
          </div>
        </div>
      </div>
    )
  }

  const evaluation = caseData.evaluationResult
  const scope = caseData.reformScope

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title={`Caso ${caseData.protocol}`}
        subtitle="Detalhe do caso"
        actions={
          <button
            type="button"
            onClick={() => router.push("/sindico/cases")}
            className="text-sm font-medium text-azulejo-700 hover:underline"
          >
            Voltar para a lista
          </button>
        }
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-4 py-6 pb-12 md:px-8">
        <div className="mx-auto max-w-3xl space-y-5">

          {/* Banner de aprovação pendente */}
          {isPendingApproval && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">
                    Aguardando sua aprovação
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Esta reforma precisa da sua aprovação antes de avançar para análise técnica.
                    Revise os detalhes abaixo e tome uma decisão.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cabeçalho do caso */}
          <div className="rounded-lg bg-paper shadow-hair p-5">
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <p className="font-mono text-xs text-ink-400 mb-1">{caseData.protocol}</p>
                <h2 className="text-base font-semibold text-ink-900">
                  Unidade {caseData.unit?.identifier ?? "—"}
                  {caseData.unit?.block && ` — Bloco ${caseData.unit.block}`}
                  {caseData.unit?.floor && ` — ${caseData.unit.floor}º andar`}
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  Morador: <span className="font-medium">{caseData.client?.name ?? "—"}</span>{" "}
                  {caseData.client?.email && (
                    <span className="text-ink-400">({caseData.client.email})</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  Aberto em{" "}
                  {new Date(caseData.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <StatusChip status={caseData.status as Parameters<typeof StatusChip>[0]["status"]} />
                {caseData.riskLevel && (
                  <RiskBadge
                    level={caseData.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                    score={caseData.triageScore ?? undefined}
                    size="sm"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Responsável técnico */}
          {(caseData.partner || canAssignPartner) && (
            <div className="rounded-lg bg-paper shadow-hair p-5">
              <h3 className="mb-2 text-sm font-semibold text-ink-900">Responsável técnico</h3>
              {caseData.partner ? (
                <p className="text-sm text-ink-700">
                  <span className="font-medium">{caseData.partner.user.name}</span> — parceiro
                  atribuído a este caso.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-600">
                    Este caso está pronto para ser encaminhado ao parceiro técnico. O parceiro
                    fixo do condomínio tem prioridade; sem parceiro fixo, a plataforma usa o
                    matching automático.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAssignPartner}
                    disabled={submitting}
                    data-testid="assign-partner-button"
                  >
                    {submitting ? "Atribuindo…" : "Atribuir ao parceiro"}
                  </Button>
                </div>
              )}
              {error && !isPendingApproval && (
                <p className="mt-2 text-sm text-iron-600">{error}</p>
              )}
            </div>
          )}

          {/* Escopo da reforma */}
          {scope && (
            <div className="rounded-lg bg-paper shadow-hair p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">Escopo da reforma</h3>
              {scope.description && (
                <p className="text-sm text-ink-700 mb-3">{scope.description}</p>
              )}
              {scope.services && scope.services.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-ink-500 mb-1">Serviços declarados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {scope.services.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center rounded-full bg-bone-100 px-2.5 py-0.5 text-xs font-medium text-ink-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-ink-600">
                {scope.estimatedArea && (
                  <span>
                    <span className="font-medium">{scope.estimatedArea} m²</span> estimados
                  </span>
                )}
                {scope.estimatedDurationDays && (
                  <span>
                    Duração estimada:{" "}
                    <span className="font-medium">{scope.estimatedDurationDays} dias</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Resultado da avaliação */}
          {evaluation && (
            <div className="rounded-lg bg-paper shadow-hair p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">
                Avaliação técnica automática
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
                <div className="rounded-lg bg-bone-50 p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Score de risco</p>
                  <p className="font-mono text-lg font-bold text-ink-800">
                    {evaluation.triageScore}
                    <span className="text-xs font-normal text-ink-400">/100</span>
                  </p>
                </div>
                <div className="rounded-lg bg-bone-50 p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Exige ART/RRT</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {evaluation.requiresART === true
                      ? "Sim"
                      : evaluation.requiresART === false
                        ? "Não"
                        : "Incerto"}
                  </p>
                </div>
                <div className="rounded-lg bg-bone-50 p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Revisão humana</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {evaluation.requiresHumanReview ? "Necessária" : "Não necessária"}
                  </p>
                </div>
                <div className="rounded-lg bg-bone-50 p-3">
                  <p className="text-xs text-ink-400 mb-0.5">Vistoria obrigatória</p>
                  <p className="text-sm font-semibold text-ink-800">
                    {evaluation.mandatoryInspection ? "Sim" : "Não"}
                  </p>
                </div>
              </div>

              {evaluation.triggeredRules && evaluation.triggeredRules.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-ink-500 mb-2">
                    Regras acionadas ({evaluation.triggeredRules.length})
                  </p>
                  <ul className="space-y-1.5">
                    {evaluation.triggeredRules.map((r) => (
                      <li
                        key={r.ruleId}
                        className="flex items-start gap-2 text-xs text-ink-600"
                      >
                        <span className="mt-px text-amber-500 shrink-0">•</span>
                        <span>
                          <span className="font-medium">{r.ruleName}:</span> {r.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Ações do síndico */}
          {isPendingApproval && (
            <div className="rounded-lg bg-paper shadow-hair p-5">
              <h3 className="mb-4 text-sm font-semibold text-ink-900">Decisão</h3>

              {/* Seleção de ação */}
              {!action && (
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setAction("approve"); setError(null) }}
                  >
                    Aprovar reforma
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => { setAction("reject"); setError(null) }}
                  >
                    Recusar reforma
                  </Button>
                </div>
              )}

              {/* Formulário de aprovação */}
              {action === "approve" && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-700">
                    Você está aprovando esta reforma. Ela avançará para a etapa de
                    análise técnica e o morador será notificado.
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-600">
                      Comentário (opcional)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Observações para o registro..."
                      className="w-full rounded-lg border border-divider bg-bone-50 px-3 py-2 text-base md:text-sm text-ink-900 placeholder:text-ink-400 focus:border-azulejo-400 focus:outline-none focus:ring-1 focus:ring-azulejo-400 resize-none"
                      rows={3}
                      maxLength={1000}
                    />
                  </div>
                  {error && <p className="text-sm text-iron-600">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={submitting}
                      onClick={handleApprove}
                    >
                      {submitting ? "Aprovando…" : "Confirmar aprovação"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAction(null); setComment(""); setError(null) }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Formulário de rejeição */}
              {action === "reject" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-iron-200 bg-iron-50 p-3">
                    <p className="text-sm text-iron-700">
                      Você está recusando esta reforma. Ela será arquivada e o morador
                      será notificado com o motivo informado. Esta ação não pode ser
                      desfeita.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-600">
                      Motivo da recusa{" "}
                      <span className="text-iron-600">*</span>{" "}
                      <span className="font-normal text-ink-400">(mínimo 10 caracteres)</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Descreva o motivo da recusa de forma clara..."
                      className="w-full rounded-lg border border-divider bg-bone-50 px-3 py-2 text-base md:text-sm text-ink-900 placeholder:text-ink-400 focus:border-azulejo-400 focus:outline-none focus:ring-1 focus:ring-azulejo-400 resize-none"
                      rows={4}
                      maxLength={2000}
                      required
                    />
                    <p className="mt-1 text-right text-xs text-ink-400">
                      {reason.length}/2000
                    </p>
                  </div>
                  {error && <p className="text-sm text-iron-600">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={submitting || reason.trim().length < 10}
                      onClick={handleReject}
                    >
                      {submitting ? "Recusando…" : "Confirmar recusa"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAction(null); setReason(""); setError(null) }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
