"use client"
import { useEffect, useState } from "react"
import { Button, Icon, Eyebrow } from "@/interfaces/components/ui"

interface OfferBreakdownItem {
  item: string
  amount: number
}
interface CaseOffer {
  planName: string
  planDescription: string | null
  quote: {
    basePrice: number
    riskSurcharge: number
    inspectionsIncluded: number
    extraInspectionCost: number
    totalPrice: number
    breakdown: OfferBreakdownItem[]
  }
  narrativa: string | null
  beneficios: string[]
  prazo: string | null
  status: string
  acceptable: boolean
  generatedAt: string
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Card da proposta comercial — visível ao morador quando há oferta para o caso.
 * Permite aceitar a proposta (apenas CLIENT, status COMMERCIAL_OFFER_SENT).
 */
export function CommercialOfferCard({
  caseId,
  isClient,
  onAccepted,
  onLoaded,
}: {
  caseId: string
  isClient: boolean
  onAccepted: () => void
  /** Sinaliza ao pai que o primeiro fetch terminou (para revelar o rail de uma vez). */
  onLoaded?: () => void
}) {
  const [offer, setOffer] = useState<CaseOffer | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/v1/cases/${caseId}/commercial/offer`)
      .then((r) => (r.ok ? r.json() : { offer: null }))
      .then((body) => {
        if (active) setOffer(body.offer ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
        onLoaded?.()
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  async function accept() {
    if (accepting) return
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/commercial/accept`, {
        method: "POST",
      })
      if (res.ok) {
        onAccepted()
      } else {
        setError("Não foi possível aceitar a proposta agora. Tente novamente.")
      }
    } catch {
      setError("Falha de conexão ao aceitar a proposta.")
    } finally {
      setAccepting(false)
    }
  }

  if (loading || !offer) return null

  const { quote } = offer

  return (
    <div
      className="rounded-md bg-surface p-5 shadow-hair"
      data-testid="commercial-offer-card"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ochre-100">
          <Icon name="star" size={16} className="text-ochre-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">Proposta comercial</p>
          <p className="font-mono text-[10px] uppercase tracking-caps text-ink-400">
            {offer.planName}
          </p>
        </div>
      </div>

      {offer.narrativa && (
        <p className="mb-3 text-xs leading-relaxed text-ink-600">{offer.narrativa}</p>
      )}

      {/* Benefícios */}
      {offer.beneficios.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {offer.beneficios.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-ink-700">
              <Icon name="check" size={12} className="mt-0.5 shrink-0 text-green-600" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* Breakdown de preço */}
      <div className="rounded-sm bg-bone-50 px-3.5 py-3">
        <Eyebrow className="mb-2">Composição do valor</Eyebrow>
        <dl className="flex flex-col gap-1.5">
          {quote.breakdown.map((b, i) => {
            const isTotal = i === quote.breakdown.length - 1
            return (
              <div
                key={i}
                className={`flex items-baseline justify-between gap-3 ${
                  isTotal ? "border-t border-bone-300 pt-1.5" : ""
                }`}
              >
                <dt
                  className={`text-xs ${
                    isTotal ? "font-semibold text-ink-900" : "text-ink-600"
                  }`}
                >
                  {b.item}
                </dt>
                <dd
                  className={`shrink-0 font-mono text-xs ${
                    isTotal ? "font-semibold text-ink-900" : "text-ink-700"
                  }`}
                >
                  {brl(b.amount)}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
        <Icon name="check" size={12} className="text-green-600" />
        {quote.inspectionsIncluded} vistorias inclusas
        {offer.prazo ? ` · ${offer.prazo}` : ""}
      </div>

      {/* Aceite — só CLIENT e enquanto aceitável */}
      {offer.acceptable && isClient && (
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            iconRight="arrow"
            onClick={accept}
            disabled={accepting}
            data-testid="accept-offer-button"
          >
            {accepting ? "Aceitando…" : "Aceitar proposta"}
          </Button>
          {error && <p className="mt-2 text-xs text-iron-700">{error}</p>}
        </div>
      )}

      {!offer.acceptable && (
        <p className="mt-3 text-xs text-ink-400">
          {offer.status === "AWAITING_PAYMENT"
            ? "Proposta aceita — aguardando confirmação de pagamento."
            : "Proposta aceita."}
        </p>
      )}

      <div className="mt-3 flex items-start gap-1.5 border-t border-divider pt-2.5">
        <Icon name="shield" size={12} className="mt-0.5 shrink-0 text-ink-400" />
        <p className="text-[10px] leading-relaxed text-ink-400">
          Valores referentes ao acompanhamento técnico-operacional. A plataforma
          não emite ART/RRT — a emissão é do profissional habilitado parceiro.
        </p>
      </div>
    </div>
  )
}
