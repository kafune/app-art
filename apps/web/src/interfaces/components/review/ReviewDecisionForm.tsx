"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/interfaces/components/ui"

interface ReviewDecisionFormProps {
  caseId: string
  /** Para onde redirecionar após registrar a decisão (default: fila do admin). */
  redirectTo?: string
}

const DECISION_OPTIONS = [
  { value: "approve", label: "Aprovar — liberar para encaminhamento" },
  { value: "approve_with_conditions", label: "Aprovar com condições" },
  { value: "reject", label: "Rejeitar — arquivar caso" },
  { value: "request_corrections", label: "Solicitar correções" },
] as const

type DecisionValue = (typeof DECISION_OPTIONS)[number]["value"]

export function ReviewDecisionForm({
  caseId,
  redirectTo = "/review-queue",
}: ReviewDecisionFormProps) {
  const router = useRouter()
  const [decision, setDecision] = useState<DecisionValue | "">("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!decision) {
      setError("Selecione uma decisão.")
      return
    }
    if (notes.trim().length < 10) {
      setError("A justificativa deve ter pelo menos 10 caracteres.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/review/${caseId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { message?: string }).message ?? `Erro ${res.status}`)
        return
      }

      router.push(redirectTo)
    } catch {
      setError("Erro de rede. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Decision options */}
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink-700">Decisão</legend>
        <div className="flex flex-col gap-2">
          {DECISION_OPTIONS.map((opt) => {
            const selected = decision === opt.value
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 transition-colors ${
                  selected
                    ? "border-green-700 bg-green-50"
                    : "border-line-strong bg-surface hover:bg-bone-50"
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setDecision(opt.value)}
                  className="sr-only"
                  data-testid={`review-decision-${opt.value}`}
                />
                {/* Custom radio indicator */}
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    selected ? "border-green-700 bg-green-700" : "border-ink-300 bg-surface"
                  }`}
                >
                  {selected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-bone-50" />
                  )}
                </span>
                <span
                  className={`text-sm ${selected ? "font-medium text-green-800" : "text-ink-700"}`}
                >
                  {opt.label}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-ink-700">
          Justificativa{" "}
          <span className="font-normal text-ink-400">(mínimo 10 caracteres)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Descreva a justificativa para a decisão..."
          className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2.5 text-base md:text-sm text-ink-900 placeholder:text-ink-300 focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
          data-testid="review-notes"
        />
        <p className="font-mono text-xs text-ink-400">
          {notes.trim().length} / 10 caracteres mínimos
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex gap-2.5 rounded-sm border border-iron-300 bg-iron-100 px-3 py-2.5">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--rai-iron-600)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path d="M8 2l6 12H2L8 2zM8 6v3M8 11v1" />
          </svg>
          <p className="text-sm text-iron-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={loading || !decision || notes.trim().length < 10}
        data-testid="review-submit"
      >
        {loading ? "Registrando…" : "Registrar decisão"}
      </Button>
    </form>
  )
}
