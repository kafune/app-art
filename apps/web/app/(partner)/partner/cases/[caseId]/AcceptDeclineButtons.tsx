"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/interfaces/components/ui"

interface AcceptDeclineButtonsProps {
  partnerId: string
  caseId: string
}

export function AcceptDeclineButtons({ partnerId, caseId }: AcceptDeclineButtonsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading("accept")
    setError(null)
    try {
      const res = await fetch(`/api/v1/partners/${partnerId}/cases/${caseId}/accept`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aceitar caso")
    } finally {
      setLoading(null)
    }
  }

  async function handleDecline() {
    if (reason.trim().length < 5) {
      setError("O motivo deve ter pelo menos 5 caracteres.")
      return
    }
    setLoading("decline")
    setError(null)
    try {
      const res = await fetch(`/api/v1/partners/${partnerId}/cases/${caseId}/decline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`)
      }
      router.push("/partner/cases")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao recusar caso")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="soft"
          size="lg"
          iconRight="arrow"
          onClick={handleAccept}
          disabled={loading !== null}
        >
          {loading === "accept" ? "Aceitando…" : "Aceitar caso"}
        </Button>
        <button
          type="button"
          onClick={() => setShowDeclineModal(true)}
          disabled={loading !== null}
          className="inline-flex items-center justify-center rounded-sm border border-white/10 px-5 py-2 text-sm font-medium text-bone-200 transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11"
        >
          Ver detalhes
        </button>
        <button
          type="button"
          onClick={() => setShowDeclineModal(true)}
          disabled={loading !== null}
          className="inline-flex items-center justify-center rounded-sm px-4 py-2 text-sm text-bone-400 transition-colors hover:text-bone-200 disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11"
        >
          Recusar
        </button>
      </div>

      {error && <p className="text-sm text-iron-300">{error}</p>}

      {/* Decline modal */}
      {showDeclineModal && (
        <div className="mt-3 rounded-md border border-iron-500 bg-white/5 p-5 space-y-4 backdrop-blur-sm">
          <p className="text-sm font-medium text-bone-100">Motivo da recusa</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Informe o motivo da recusa (mínimo 5 caracteres)…"
            className="w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-bone-100 placeholder-bone-400 outline-none focus:ring-2 focus:ring-green-400"
          />
          <p className="text-xs text-bone-400">{reason.trim().length} / 5 caracteres mínimos</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDecline}
              disabled={loading !== null || reason.trim().length < 5}
            >
              {loading === "decline" ? "Recusando…" : "Confirmar recusa"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowDeclineModal(false)
                setReason("")
                setError(null)
              }}
              disabled={loading !== null}
              className="inline-flex items-center justify-center rounded-sm border border-white/10 px-4 py-2 text-sm text-bone-300 transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
