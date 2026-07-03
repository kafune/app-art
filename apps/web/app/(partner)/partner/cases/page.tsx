"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  TopBar,
  Card,
  Eyebrow,
  RiskBadge,
  StatusChip,
  SearchInput,
} from "@/interfaces/components/ui"

type Tab = "active" | "watch" | "done" | "all"

const ACTIVE_STATUSES = new Set([
  "ASSIGNED_TO_PARTNER",
  "ART_RRT_PENDING",
  "INSPECTIONS_SCHEDULED",
  "IN_EXECUTION",
])

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Inicial",
  INTERMEDIATE: "Intermediária",
  FINAL: "Final",
  EXTRA: "Extra",
  CRITICAL_SYSTEM: "Sistema crítico",
}

type InspectionRow = {
  id: string
  type: string
  scheduledAt: string | null
}

type CaseRow = {
  id: string
  protocol: string
  status: string
  riskLevel: string | null
  triageScore: number | null
  updatedAt: string
  condominium: { name: string } | null
  unit: { identifier: string } | null
  inspections: InspectionRow[] | null
  /** false = caso do condomínio fixo ainda não atribuído a mim (acompanhamento). */
  assignedToMe?: boolean
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

const tabs: Array<{ value: Tab; label: string }> = [
  { value: "active", label: "Ativos" },
  { value: "watch", label: "Condomínio" },
  { value: "done", label: "Concluídos" },
  { value: "all", label: "Todos" },
]

function PartnerCasesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const tab: Tab =
    tabParam === "done"
      ? "done"
      : tabParam === "all"
        ? "all"
        : tabParam === "watch"
          ? "watch"
          : "active"

  const [allCases, setAllCases] = useState<CaseRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetchCases(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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
      if (!data.cases || data.cases.length === 0) {
        // Could be partner not found or genuinely empty
        setAllCases([])
      } else {
        setAllCases(data.cases as CaseRow[])
      }
    } catch {
      setAllCases([])
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(value: string) {
    setSearch(value)
    fetchCases(value)
  }

  // Apply tab filter client-side after fetching
  const cases = allCases.filter((c) => {
    if (tab === "active") return ACTIVE_STATUSES.has(c.status) && c.assignedToMe !== false
    if (tab === "watch") return c.assignedToMe === false
    if (tab === "done") return c.status === "CONCLUDED"
    return true
  })

  if (notFound) {
    return (
      <div className="flex flex-col">
        <TopBar title="Meus Casos" />
        <div className="p-8">
          <p className="text-sm text-iron-600">Perfil de parceiro não encontrado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <TopBar
        title="Meus Casos"
        subtitle={loading ? "Carregando..." : `${cases.length} caso(s) encontrado(s)`}
      />

      <div className="flex-1 bg-bone-50 p-8">
        {/* Search bar */}
        <div className="mb-5">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Buscar por protocolo, nome ou unidade..."
          />
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-divider">
          {tabs.map((t) => (
            <Link
              key={t.value}
              href={`/partner/cases?tab=${t.value}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? "border-green-700 text-green-800"
                  : "border-transparent text-ink-500 hover:text-ink-700 hover:border-line-strong"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {loading ? (
          <Card className="py-12 text-center">
            <p className="text-sm text-ink-400">Carregando casos...</p>
          </Card>
        ) : cases.length === 0 ? (
          <Card className="py-12 text-center">
            {search ? (
              <>
                <p className="text-sm font-medium text-ink-700">
                  Nenhum caso encontrado para &ldquo;{search}&rdquo;
                </p>
                <p className="mt-1 text-sm text-ink-400">Tente um termo diferente.</p>
              </>
            ) : (
              <p className="text-sm text-ink-400">Nenhum caso nesta categoria.</p>
            )}
          </Card>
        ) : (
          <Card padded={false}>
            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="border-b border-divider px-5 py-3 grid min-w-[760px] grid-cols-[110px_1fr_150px_165px_150px_60px] gap-3 items-center">
                <Eyebrow>Protocolo</Eyebrow>
                <Eyebrow>Condomínio · Unidade</Eyebrow>
                <Eyebrow>Risco</Eyebrow>
                <Eyebrow>Status</Eyebrow>
                <Eyebrow>Próxima vistoria</Eyebrow>
                <span />
              </div>

              {/* Table rows */}
              {cases.map((c, i) => {
                const nextInspection = c.inspections?.[0] ?? null
                return (
                  <div
                    key={c.id}
                    className={`px-5 py-3.5 grid min-w-[760px] grid-cols-[110px_1fr_150px_165px_150px_60px] gap-3 items-center transition-colors hover:bg-bone-50 ${
                      i > 0 ? "border-t border-divider" : ""
                    }`}
                  >
                    {/* Protocol */}
                    <span className="font-mono text-xs text-ink-500 tracking-wide">
                      {c.protocol}
                    </span>

                    {/* Condo · Unit */}
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
                        <span>{c.condominium?.name ?? "—"}</span>
                        {c.assignedToMe === false && (
                          <span
                            className="inline-flex items-center rounded-full bg-azulejo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-azulejo-700"
                            title="Caso do condomínio onde você é o parceiro fixo — ainda não atribuído a você"
                          >
                            Acompanhamento
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5">
                        Un. {c.unit?.identifier ?? "—"}
                      </div>
                    </div>

                    {/* Risk */}
                    {c.riskLevel ? (
                      <RiskBadge
                        level={c.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                        score={c.triageScore ?? undefined}
                        size="sm"
                      />
                    ) : (
                      <span className="text-ink-300 text-sm">—</span>
                    )}

                    {/* Status */}
                    <StatusChip status={c.status as Parameters<typeof StatusChip>[0]["status"]} />

                    {/* Next inspection */}
                    <span className="font-mono text-xs text-ink-500">
                      {nextInspection
                        ? `${INSPECTION_TYPE_LABELS[nextInspection.type] ?? nextInspection.type} · ${formatDate(nextInspection.scheduledAt)}`
                        : "—"}
                    </span>

                    {/* Action */}
                    <Link
                      href={`/partner/cases/${c.id}`}
                      className="text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
                    >
                      Abrir →
                    </Link>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function PartnerCasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col">
          <TopBar title="Meus Casos" subtitle="Carregando..." />
          <div className="flex-1 bg-bone-50 p-8">
            <p className="text-sm text-ink-400">Carregando casos...</p>
          </div>
        </div>
      }
    >
      <PartnerCasesContent />
    </Suspense>
  )
}
