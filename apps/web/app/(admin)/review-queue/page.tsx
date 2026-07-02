"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TopBar, RiskBadge, StatusChip, Eyebrow, SearchInput } from "@/interfaces/components/ui"

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"])

type CaseRow = {
  id: string
  protocol: string
  status: string
  riskLevel: string | null
  triageScore: number | null
  createdAt: string
  condominium: { name: string } | null
  unit: { identifier: string } | null
}

export default function ReviewQueuePage() {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  // Auth guard via session — redirect handled server-side for this panel
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
      // Filter to only HUMAN_REVIEW_REQUIRED on client — the API returns all cases for ADMIN
      const filtered = (data.cases as CaseRow[]).filter(
        (c) => c.status === "HUMAN_REVIEW_REQUIRED",
      )
      setCases(filtered)
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

  return (
    <>
      <TopBar
        title="Fila de Revisão Humana"
        subtitle={loading ? "Carregando..." : `${cases.length} caso(s) aguardando revisão`}
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-8 py-8">
        {/* Search bar */}
        <div className="mb-5">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Buscar por protocolo, nome ou unidade..."
          />
        </div>

        {loading ? (
          <div className="rounded-lg bg-surface p-12 text-center shadow-hair">
            <p className="text-sm text-ink-400">Carregando casos...</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-lg bg-surface p-12 text-center shadow-hair">
            {search ? (
              <>
                <p className="text-sm font-medium text-ink-700">
                  Nenhum caso encontrado para &ldquo;{search}&rdquo;
                </p>
                <p className="mt-1 text-sm text-ink-400">Tente um termo diferente.</p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <span className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <p className="text-sm font-medium text-ink-700">Fila vazia</p>
                <p className="mt-1 text-sm text-ink-400">Nenhum caso aguardando revisão humana.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-hair">
            {/* Table header */}
            <div className="grid min-w-[760px] grid-cols-[120px_1fr_160px_80px_120px_80px] items-center gap-4 border-b border-divider bg-bone-50 px-5 py-3">
              <Eyebrow>Protocolo</Eyebrow>
              <Eyebrow>Condomínio · Unidade</Eyebrow>
              <Eyebrow>Risco</Eyebrow>
              <Eyebrow>Score</Eyebrow>
              <Eyebrow>Criado em</Eyebrow>
              <span />
            </div>

            {/* Table rows */}
            <div className="divide-y divide-divider">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="grid min-w-[760px] grid-cols-[120px_1fr_160px_80px_120px_80px] items-center gap-4 px-5 py-4 transition-colors hover:bg-bone-50"
                  data-testid="review-queue-item"
                >
                  <span className="font-mono text-xs font-medium text-ink-500">
                    {c.protocol}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-ink-900">{c.condominium?.name ?? "—"}</div>
                    <div className="mt-0.5 text-xs text-ink-500">Un.&nbsp;{c.unit?.identifier ?? "—"}</div>
                  </div>
                  <div>
                    {c.riskLevel ? (
                      <RiskBadge
                        level={c.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                        score={c.triageScore ?? undefined}
                        size="sm"
                      />
                    ) : (
                      <span className="text-sm text-ink-300">—</span>
                    )}
                  </div>
                  <span className="font-mono text-sm text-ink-600">
                    {c.triageScore ?? "—"}
                  </span>
                  <span className="font-mono text-xs text-ink-500">
                    {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex justify-end">
                    <Link
                      href={`/review-queue/${c.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ink-900 px-3 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-bone-50"
                      data-testid="review-queue-link"
                    >
                      Revisar →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
