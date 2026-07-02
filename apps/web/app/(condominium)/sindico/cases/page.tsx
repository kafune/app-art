"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { TopBar, RiskBadge, StatusChip, Eyebrow, SearchInput } from "@/interfaces/components/ui"

type UnitRow = {
  id: string
  identifier: string
}

type CaseRow = {
  id: string
  protocol: string
  status: string
  riskLevel: string | null
  triageScore: number | null
  reformScope: unknown
  createdAt: string
  unit: UnitRow | null
}

function scopeDescription(scope: unknown): string {
  if (
    scope &&
    typeof scope === "object" &&
    !Array.isArray(scope) &&
    "description" in scope
  ) {
    return String((scope as { description?: string }).description ?? "")
  }
  return ""
}

function CasesTable({
  cases,
  onRowClick,
}: {
  cases: CaseRow[]
  onRowClick: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg bg-paper shadow-hair">
      {/* Table header */}
      <div
        className="grid min-w-[820px] items-center gap-4 border-b border-divider px-6 py-3 font-mono text-[10px] uppercase tracking-caps text-ink-400"
        style={{ gridTemplateColumns: "130px 90px 1fr 150px 180px 100px" }}
      >
        <span>Protocolo</span>
        <span>Unidade</span>
        <span>Escopo</span>
        <span>Risco</span>
        <span>Status</span>
        <span className="text-right">Criado em</span>
      </div>

      {/* Table rows */}
      <div className="flex flex-col divide-y divide-divider">
        {cases.map((c) => {
          const desc = scopeDescription(c.reformScope)
          const createdAt = new Date(c.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          })

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onRowClick(c.id)}
              className="grid min-w-[820px] w-full items-center gap-4 px-6 py-4 hover:bg-bone-50 transition-colors text-left"
              style={{ gridTemplateColumns: "130px 90px 1fr 150px 180px 100px" }}
              data-testid="case-row"
            >
              {/* Protocolo */}
              <span className="font-mono text-[11px] tracking-wide text-ink-500">
                {c.protocol}
              </span>

              {/* Unidade */}
              <span className="text-sm font-medium text-ink-800">
                {c.unit?.identifier ?? "—"}
              </span>

              {/* Escopo */}
              <span className="truncate text-sm text-ink-700" title={desc}>
                {desc || <span className="text-ink-300">—</span>}
              </span>

              {/* Risco */}
              {c.riskLevel ? (
                <RiskBadge
                  level={c.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                  score={c.triageScore ?? undefined}
                  size="sm"
                />
              ) : (
                <span className="text-xs text-ink-300">Não classificado</span>
              )}

              {/* Status */}
              <StatusChip status={c.status as Parameters<typeof StatusChip>[0]["status"]} />

              {/* Data */}
              <span className="text-right font-mono text-[11px] text-ink-400">
                {createdAt}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function SindicoCasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [noCondominium, setNoCondominium] = useState(false)

  useEffect(() => {
    fetchCases("")
  }, [])

  async function fetchCases(query: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set("search", query)
      const res = await fetch(`/api/v1/cases?${params.toString()}`)
      if (res.status === 401) {
        router.push("/login")
        return
      }
      if (res.status === 403) {
        router.push("/cases")
        return
      }
      const data = await res.json()
      setCases(data.cases as CaseRow[])
    } catch {
      setCases([])
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(value: string) {
    setSearch(value)
    fetchCases(value)
  }

  function handleRowClick(id: string) {
    router.push(`/sindico/cases/${id}`)
  }

  // Separa casos aguardando aprovação do síndico dos demais
  const pendingApproval = cases.filter((c) => c.status === "AWAITING_SYNDIC_APPROVAL")
  const otherCases = cases.filter((c) => c.status !== "AWAITING_SYNDIC_APPROVAL")

  if (noCondominium) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Casos do condomínio" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-ink-700 font-medium">Nenhum condomínio vinculado à sua conta.</p>
            <p className="text-ink-400 text-sm mt-1">
              Entre em contato com o administrador da plataforma.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title="Casos do condomínio"
        subtitle={
          loading
            ? "Carregando..."
            : `${cases.length} caso${cases.length !== 1 ? "s" : ""} registrado${cases.length !== 1 ? "s" : ""}`
        }
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-8 py-6 pb-12">
        {/* Search bar */}
        <div className="mb-5">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Buscar por protocolo, nome ou unidade..."
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-sm text-ink-400">Carregando casos...</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              {search ? (
                <>
                  <p className="text-ink-700 font-medium">
                    Nenhum caso encontrado para &ldquo;{search}&rdquo;
                  </p>
                  <p className="text-ink-400 text-sm mt-1">Tente um termo diferente.</p>
                </>
              ) : (
                <>
                  <p className="text-ink-700 font-medium">Nenhum caso registrado.</p>
                  <p className="text-ink-400 text-sm mt-1">
                    Os casos de reforma do seu condomínio aparecerão aqui.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Seção: Aguardando aprovação */}
            {pendingApproval.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-amber-600 text-base">⏳</span>
                  <h2 className="text-sm font-semibold text-ink-900">
                    Aguardando sua aprovação
                  </h2>
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
                    {pendingApproval.length}
                  </span>
                </div>
                <div className="rounded-lg overflow-hidden ring-2 ring-amber-300 shadow-sm">
                  <CasesTable cases={pendingApproval} onRowClick={handleRowClick} />
                </div>
              </div>
            )}

            {/* Seção: Demais casos */}
            {otherCases.length > 0 && (
              <div>
                {pendingApproval.length > 0 && (
                  <h2 className="mb-3 text-sm font-semibold text-ink-900">Demais casos</h2>
                )}
                <CasesTable cases={otherCases} onRowClick={handleRowClick} />
              </div>
            )}

            {/* Footer: total count */}
            <div className="px-1">
              <Eyebrow className="text-ink-400">
                {cases.length} resultado{cases.length !== 1 ? "s" : ""}
              </Eyebrow>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
