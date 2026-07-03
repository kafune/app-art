"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  TopBar,
  Button,
  CaseCard,
  Badge,
  Icon,
  SearchInput,
} from "@/interfaces/components/ui"
import { PendingActionsWidget } from "@/interfaces/components/ui/PendingActionsWidget"

interface CaseRow {
  id: string
  protocol: string
  status: string
  riskLevel: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_PT: Record<string, string> = {
  DRAFT: "Rascunho",
  AWAITING_SCOPE_DETAILS: "Aguardando triagem",
  SCOPE_CLASSIFIED: "Classificado",
  AWAITING_DOCUMENTS: "Enviar documentos",
  PENDING_CORRECTIONS: "Corrigir documentos",
  DOCUMENTS_UNDER_REVIEW: "Em análise",
  ELIGIBLE_FOR_RELEASE: "Pronto para liberar",
  RELEASED_WITH_CONDITIONS: "Liberado c/ condições",
  HUMAN_REVIEW_REQUIRED: "Em revisão",
  COMMERCIAL_OFFER_SENT: "Proposta enviada",
  AWAITING_PAYMENT: "Aguardando pagamento",
  ASSIGNED_TO_PARTNER: "Parceiro atribuído",
  ART_RRT_PENDING: "ART/RRT pendente",
  INSPECTIONS_SCHEDULED: "Vistoria agendada",
  IN_EXECUTION: "Em execução",
  CONCLUDED: "Concluído",
  ARCHIVED: "Arquivado",
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "agora mesmo"
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days > 1 ? "s" : ""}`
}

export default function CasesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [units, setUnits] = useState<Array<{ id: string; identifier: string; block: string | null; condominium: { name: string } }>>([])
  const [creating, setCreating] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState("")
  const [search, setSearch] = useState("")
  const unitSelectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/v1/cases").then((r) => r.json()).then((d) => {
      // Sort by updatedAt DESC (most recent first), preserve API order if already sorted
      const sorted = (d.cases ?? []).slice().sort(
        (a: CaseRow, b: CaseRow) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime(),
      )
      setCases(sorted)
    })
    fetch("/api/v1/units").then((r) => r.json()).then((d) => {
      setUnits(d.units ?? [])
      if (d.units?.[0]) setSelectedUnit(d.units[0].id)
    })
  }, [status])

  async function createCase() {
    if (!selectedUnit) return
    setCreating(true)
    const res = await fetch("/api/v1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: selectedUnit }),
    })
    setCreating(false)
    if (res.ok) {
      const c = await res.json()
      router.push(`/cases/${c.id}`)
    }
  }

  const filteredCases = cases.filter(
    (c) =>
      search === "" ||
      c.protocol.toLowerCase().includes(search.toLowerCase()) ||
      (STATUS_PT[c.status] ?? c.status).toLowerCase().includes(search.toLowerCase()),
  )

  if (status !== "authenticated") return null

  return (
    <>
      <TopBar
        title="Minhas reformas"
        subtitle={`${session?.user?.name ?? ""} · ${session?.user?.email ?? ""}`}
        actions={
          <Badge tone="neutral">
            {cases.length} {cases.length === 1 ? "caso" : "casos"}
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto bg-paper px-4 py-6 md:px-8">
        {/* Pending actions inbox */}
        <PendingActionsWidget />

        {/* New case card */}
        <div className="mb-6 rounded-md bg-surface p-5 shadow-hair">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="plus" size={16} className="text-green-700" />
            <span className="text-sm font-semibold text-ink-900">Nova triagem</span>
          </div>
          <div className="flex gap-3">
            <select
              ref={unitSelectRef}
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="flex-1 rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-green-400 max-md:min-h-11"
              data-testid="unit-select"
              disabled={units.length === 0}
            >
              {units.length === 0 && (
                <option value="">Nenhuma unidade disponível</option>
              )}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.condominium.name} — {u.block ? `Bl. ${u.block} · ` : ""}Un. {u.identifier}
                </option>
              ))}
            </select>
            <Button
              onClick={createCase}
              disabled={!selectedUnit || creating}
              variant="primary"
              icon="arrow"
              data-testid="create-case-button"
            >
              {creating ? "Criando…" : "Iniciar triagem"}
            </Button>
          </div>

          {/* Warning when no units are linked */}
          {units.length === 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-sm bg-ochre-50 px-3 py-2.5">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-ochre-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-xs text-ochre-700 leading-relaxed">
                Sua unidade não está cadastrada ainda.{" "}
                <span className="font-medium">
                  Entre em contato com o síndico do seu condomínio para ser vinculado.
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Cases grid */}
        {cases.length === 0 ? (
          /* Onboarding banner — first case */
          <div className="rounded-md border border-green-200 bg-green-50 p-6 shadow-hair">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-5 w-5 text-green-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-ink-900">
                  Bem-vindo ao ReformAI!
                </p>
                <p className="text-sm text-ink-600">
                  Registre, acompanhe e documente sua reforma com assistência de IA.
                </p>
              </div>
            </div>

            <ol className="mb-5 space-y-2">
              {[
                "Selecione sua unidade e inicie a triagem",
                "Descreva a reforma no chat com IA",
                "Envie os documentos necessários",
                "Acompanhe a análise e liberação",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-200 font-mono text-[11px] font-semibold text-green-800">
                    {i + 1}
                  </span>
                  <span className="text-sm text-ink-700">{step}</span>
                </li>
              ))}
            </ol>

            <Button
              variant="primary"
              icon="arrow"
              onClick={() => unitSelectRef.current?.focus()}
              disabled={units.length === 0}
            >
              Iniciar minha primeira reforma
            </Button>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="mb-4">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar por protocolo ou status…"
              />
            </div>

            {filteredCases.length === 0 ? (
              <div className="rounded-md border border-dashed border-bone-400 p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bone-100">
                  <Icon name="search" size={20} className="text-ink-400" />
                </div>
                <p className="text-sm font-medium text-ink-700">
                  Nenhuma reforma encontrada para &ldquo;{search}&rdquo;
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Tente buscar pelo número de protocolo ou status em português.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCases.map((c) => {
                  const dateStr = c.updatedAt ?? c.createdAt
                  const statusLabel = STATUS_PT[c.status] ?? c.status
                  return (
                    <div key={c.id} data-testid="case-list-item">
                      <CaseCard
                        protocol={c.protocol}
                        title={c.protocol}
                        subtitle={`${statusLabel} · ${relativeTime(dateStr)}`}
                        risk={c.riskLevel as any}
                        status={c.status}
                        updated={relativeTime(dateStr)}
                        href={`/cases/${c.id}`}
                      />
                      {/* hidden span for testid on protocol */}
                      <span className="sr-only" data-testid="case-protocol">{c.protocol}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
