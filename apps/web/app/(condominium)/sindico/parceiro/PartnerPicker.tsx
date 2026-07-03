"use client"
import { useCallback, useEffect, useState } from "react"
import { Button, Card, Eyebrow, Badge, Icon } from "@/interfaces/components/ui"

interface PartnerRow {
  id: string
  name: string
  type: string
  creaNumber: string
  specialties: string[]
  rating: number | string | null
  slaHours: number | null
}

const TYPE_LABELS: Record<string, string> = {
  ENGINEER: "Engenheiro(a)",
  ARCHITECT: "Arquiteto(a)",
}

function ratingLabel(rating: number | string | null): string {
  if (rating == null) return "Sem avaliações"
  const n = Number(rating)
  return isNaN(n) ? "Sem avaliações" : `★ ${n.toFixed(1)}`
}

/** Card do parceiro fixo do condomínio + escolha/troca a partir da rede. */
export function PartnerPicker({ condominiumId }: { condominiumId: string }) {
  const [current, setCurrent] = useState<PartnerRow | null>(null)
  const [candidates, setCandidates] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [choosing, setChoosing] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [currentRes, listRes] = await Promise.all([
        fetch(`/api/v1/condominiums/${condominiumId}/partner`),
        fetch("/api/v1/partners"),
      ])
      if (currentRes.ok) setCurrent((await currentRes.json()).partner ?? null)
      if (listRes.ok) setCandidates((await listRes.json()).partners ?? [])
    } catch {
      setError("Não foi possível carregar os parceiros. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }, [condominiumId])

  useEffect(() => {
    load()
  }, [load])

  async function setPartner(partnerId: string | null) {
    setSavingId(partnerId ?? "remove")
    setError(null)
    const res = await fetch(`/api/v1/condominiums/${condominiumId}/partner`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partnerId }),
    })
    setSavingId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? "Não foi possível salvar. Tente novamente.")
      return
    }
    setCurrent((await res.json()).partner ?? null)
    setChoosing(false)
  }

  if (loading) {
    return <p className="text-sm text-ink-400">Carregando parceiros…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-iron-600">{error}</p>}

      {/* Parceiro atual */}
      {current ? (
        <Card className="!p-5" data-testid="current-partner-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow>Parceiro técnico fixo</Eyebrow>
              <p className="mt-1.5 text-base font-semibold text-ink-900">{current.name}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {TYPE_LABELS[current.type] ?? current.type} · CREA/CAU {current.creaNumber} ·{" "}
                {ratingLabel(current.rating)}
              </p>
              {current.specialties.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {current.specialties.map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setChoosing((v) => !v)}>
                {choosing ? "Cancelar" : "Trocar parceiro"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPartner(null)}
                disabled={savingId !== null}
              >
                {savingId === "remove" ? "Removendo…" : "Remover"}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="!p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-ochre-600" />
              <div>
                <p className="text-sm font-medium text-ink-900">
                  Nenhum parceiro técnico definido.
                </p>
                <p className="mt-0.5 text-sm text-ink-500">
                  Sem parceiro fixo, os casos são direcionados pelo matching automático da
                  plataforma (cidade, estado e especialidade).
                </p>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => setChoosing((v) => !v)}>
              {choosing ? "Cancelar" : "Escolher parceiro"}
            </Button>
          </div>
        </Card>
      )}

      {/* Lista de candidatos */}
      {choosing && (
        <div>
          <Eyebrow>Parceiros disponíveis na rede</Eyebrow>
          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-ink-400">
              Nenhum parceiro ativo disponível. Fale com a administradora.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-divider overflow-hidden rounded-md bg-surface shadow-hair">
              {candidates.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  data-testid="partner-candidate"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {p.name}
                      {current?.id === p.id && (
                        <span className="ml-2 text-xs font-normal text-green-700">(atual)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {TYPE_LABELS[p.type] ?? p.type} · CREA/CAU {p.creaNumber} ·{" "}
                      {ratingLabel(p.rating)}
                      {p.specialties.length > 0 && ` · ${p.specialties.slice(0, 4).join(", ")}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPartner(p.id)}
                    disabled={savingId !== null || current?.id === p.id}
                  >
                    {savingId === p.id ? "Definindo…" : "Definir como parceiro"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
