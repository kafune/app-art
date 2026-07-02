import Link from "next/link"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { CaseStatus, RiskLevel } from "@reformai/database"
import {
  TopBar,
  RiskBadge,
  StatusChip,
  Eyebrow,
  Badge,
  Icon,
} from "@/interfaces/components/ui"
import { PendingActionsWidget } from "@/interfaces/components/ui/PendingActionsWidget"

export const dynamic = "force-dynamic"

const ACTIVE_STATUSES: CaseStatus[] = [
  CaseStatus.AWAITING_SCOPE_DETAILS,
  CaseStatus.SCOPE_CLASSIFIED,
  CaseStatus.AWAITING_DOCUMENTS,
  CaseStatus.DOCUMENTS_UNDER_REVIEW,
  CaseStatus.PENDING_CORRECTIONS,
  CaseStatus.ELIGIBLE_FOR_RELEASE,
  CaseStatus.RELEASED_WITH_CONDITIONS,
  CaseStatus.HUMAN_REVIEW_REQUIRED,
  CaseStatus.COMMERCIAL_OFFER_SENT,
  CaseStatus.AWAITING_PAYMENT,
  CaseStatus.ASSIGNED_TO_PARTNER,
  CaseStatus.ART_RRT_PENDING,
  CaseStatus.INSPECTIONS_SCHEDULED,
  CaseStatus.IN_EXECUTION,
]

const ATTENTION_STATUSES: CaseStatus[] = [
  CaseStatus.HUMAN_REVIEW_REQUIRED,
  CaseStatus.PENDING_CORRECTIONS,
  CaseStatus.DOCUMENTS_UNDER_REVIEW,
  CaseStatus.AWAITING_DOCUMENTS,
]

const CONCLUDED_YEAR_STATUSES: CaseStatus[] = [CaseStatus.CONCLUDED]

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `há ${diffD}d`
}

export default async function SindicoDashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "CONDOMINIUM") redirect("/cases")

  if (!user.condominiumId) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar
          title="Visão geral"
          subtitle="Painel do condomínio"
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-ink-700 font-medium">Nenhum condomínio vinculado à sua conta.</p>
            <p className="text-ink-400 text-sm mt-1">Entre em contato com o administrador da plataforma.</p>
          </div>
        </div>
      </div>
    )
  }

  const { tenantId, condominiumId } = user
  const baseWhere = { tenantId, condominiumId }

  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const [
    activeCases,
    awaitingReview,
    inExecution,
    concludedYear,
    attentionCases,
    byRiskRaw,
    recentActivity,
    last14DaysCases,
  ] = await Promise.all([
    // Stat: Casos ativos
    prisma.reformCase.count({
      where: { ...baseWhere, status: { in: ACTIVE_STATUSES } },
    }),
    // Stat: Aguardando revisão
    prisma.reformCase.count({
      where: { ...baseWhere, status: CaseStatus.HUMAN_REVIEW_REQUIRED },
    }),
    // Stat: Em execução
    prisma.reformCase.count({
      where: { ...baseWhere, status: CaseStatus.IN_EXECUTION },
    }),
    // Stat: Concluídos no ano
    prisma.reformCase.count({
      where: {
        ...baseWhere,
        status: { in: CONCLUDED_YEAR_STATUSES },
        updatedAt: { gte: startOfYear },
      },
    }),
    // Tabela de atenção: HUMAN_REVIEW | PENDING_CORRECTIONS | HIGH/CRITICAL
    prisma.reformCase.findMany({
      where: {
        ...baseWhere,
        OR: [
          { status: { in: ATTENTION_STATUSES } },
          { riskLevel: { in: [RiskLevel.HIGH, RiskLevel.CRITICAL] } },
        ],
      },
      include: { unit: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    // Distribuição por risco
    prisma.reformCase.groupBy({
      by: ["riskLevel"],
      _count: { _all: true },
      where: { ...baseWhere, riskLevel: { not: null } },
    }),
    // Feed: transições recentes (últimas 5)
    prisma.caseTransitionLog.findMany({
      where: {
        case: { ...baseWhere },
      },
      include: { case: { include: { unit: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Novos casos nos últimos 14 dias (para o gráfico de barras)
    prisma.reformCase.findMany({
      where: {
        ...baseWhere,
        createdAt: { gte: fourteenDaysAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Montar contagens diárias para o mini-gráfico (últimos 14 dias)
  const dayCounts: number[] = Array(14).fill(0)
  for (const c of last14DaysCases) {
    const diffDays = Math.floor(
      (now.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    const idx = 13 - Math.min(diffDays, 13)
    dayCounts[idx] = (dayCounts[idx] ?? 0) + 1
  }
  const maxBar = Math.max(...dayCounts, 1)
  const total14Days = dayCounts.reduce((a, b) => a + b, 0)

  // Distribuição de risco
  const riskCounts: Record<string, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  }
  for (const row of byRiskRaw) {
    if (row.riskLevel) riskCounts[row.riskLevel] = row._count._all
  }
  const totalWithRisk = Object.values(riskCounts).reduce((a, b) => a + b, 0)

  // Calcular % por risco para barra segmentada
  const riskPercent = (level: string) =>
    totalWithRisk > 0
      ? ((riskCounts[level] ?? 0) / totalWithRisk) * 100
      : 0

  // Formatter for 14-day chart dates
  const getBarLabel = (daysAgo: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  // Count critical cases for subtitle
  const criticalCount = (riskCounts["CRITICAL"] ?? 0) + (riskCounts["HIGH"] ?? 0)

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title="Visão geral"
        subtitle={`${activeCases} casos ativos · ${awaitingReview} aguardando revisão · ${criticalCount} de risco elevado`}
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-8 py-6 pb-12">
        {/* ── Pending actions inbox ── */}
        <PendingActionsWidget />

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              label: "Casos ativos",
              value: activeCases,
              delta: "em andamento",
              accent: "green",
              testId: "stat-active",
            },
            {
              label: "Aguardando revisão",
              value: awaitingReview,
              delta: awaitingReview > 0 ? `${awaitingReview > 1 ? "exigem" : "exige"} atenção` : "nenhum pendente",
              accent: awaitingReview > 0 ? "ochre" : "green",
              testId: "stat-review",
            },
            {
              label: "Em execução",
              value: inExecution,
              delta: "obras em curso",
              accent: "azulejo",
              testId: "stat-execution",
            },
            {
              label: "Concluídos · ano",
              value: concludedYear,
              delta: "neste ano",
              accent: "green",
              testId: "stat-concluded",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="relative overflow-hidden rounded-lg bg-paper p-5 shadow-hair"
              data-testid={s.testId}
            >
              <Eyebrow>{s.label}</Eyebrow>
              <div
                className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink-900"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.value}
              </div>
              <div
                className="mt-1 text-xs"
                style={{ color: `var(--rai-${s.accent}-700)` }}
              >
                {s.delta}
              </div>
              <span
                className="absolute bottom-3.5 right-4 h-2 w-2 rounded-full opacity-40"
                style={{ background: `var(--rai-${s.accent}-500)` }}
              />
            </div>
          ))}
        </div>

        {/* ── Main grid ── */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* ── Left: Tabela de atenção ── */}
          <div className="overflow-hidden rounded-lg bg-paper shadow-hair">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <h3 className="text-base font-semibold tracking-snug text-ink-900">
                  Casos que pedem sua atenção
                </h3>
                <p className="mt-0.5 text-sm text-ink-500">
                  Risco alto, pendências e revisões
                </p>
              </div>
              <Link
                href="/sindico/cases"
                className="flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-medium text-ink-500 hover:bg-bone-100 transition-colors"
              >
                Ver todos
                <Icon name="chevR" size={12} />
              </Link>
            </div>

            {attentionCases.length === 0 ? (
              <div className="border-t border-divider px-6 py-8 text-center text-sm text-ink-400">
                Nenhum caso requer atenção no momento.
              </div>
            ) : (
              <div className="flex flex-col overflow-x-auto">
                {/* Header row */}
                <div className="grid min-w-[720px] items-center gap-4 border-t border-divider px-6 pb-2 pt-2 font-mono text-[10px] uppercase tracking-caps text-ink-400"
                  style={{ gridTemplateColumns: "100px 80px 1fr 140px 170px 60px" }}>
                  <span>Protocolo</span>
                  <span>Unidade</span>
                  <span>Escopo</span>
                  <span>Risco</span>
                  <span>Status</span>
                  <span className="text-right">Atualizado</span>
                </div>
                {attentionCases.map((c) => {
                  const scope =
                    c.reformScope &&
                    typeof c.reformScope === "object" &&
                    !Array.isArray(c.reformScope) &&
                    "description" in c.reformScope
                      ? String((c.reformScope as { description?: string }).description ?? "")
                      : ""

                  return (
                    <div
                      key={c.id}
                      className="grid min-w-[720px] items-center gap-4 border-t border-divider px-6 py-3"
                      style={{ gridTemplateColumns: "100px 80px 1fr 140px 170px 60px" }}
                    >
                      <span className="font-mono text-[11px] tracking-wide text-ink-500">
                        {c.protocol}
                      </span>
                      <span className="text-sm font-medium text-ink-800">
                        {c.unit.identifier}
                      </span>
                      <span className="truncate text-sm text-ink-700">
                        {scope || "—"}
                      </span>
                      {c.riskLevel ? (
                        <RiskBadge
                          level={c.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                          score={c.triageScore ?? undefined}
                          size="sm"
                        />
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                      <StatusChip status={c.status} />
                      <span className="text-right font-mono text-[11px] text-ink-400">
                        {formatRelativeTime(c.updatedAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-5">
            {/* Bar chart: novos casos 14 dias */}
            <div className="rounded-lg bg-paper p-5 shadow-hair">
              <div className="flex items-start justify-between">
                <div>
                  <Eyebrow>Novos casos · 14 dias</Eyebrow>
                  <div
                    className="mt-1.5 font-mono text-xl font-semibold text-ink-900"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {total14Days}
                  </div>
                </div>
                {total14Days > 0 && (
                  <Badge tone="green" dot>
                    período atual
                  </Badge>
                )}
              </div>
              <div
                className="mt-4 flex items-end gap-1"
                style={{ height: 80 }}
              >
                {dayCounts.map((v, i) => (
                  <div
                    key={i}
                    title={`${v} caso${v !== 1 ? "s" : ""}`}
                    className="flex-1 rounded-t-sm transition-[height]"
                    style={{
                      height: `${Math.max((v / maxBar) * 100, v > 0 ? 4 : 0)}%`,
                      minHeight: v > 0 ? 3 : 0,
                      background:
                        i === dayCounts.length - 1
                          ? "var(--rai-green-700)"
                          : "var(--rai-green-300)",
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-caps text-ink-400">
                <span>{getBarLabel(13)}</span>
                <span>{getBarLabel(7)}</span>
                <span>{getBarLabel(0)}</span>
              </div>
            </div>

            {/* Distribuição por risco */}
            <div className="rounded-lg bg-paper p-5 shadow-hair">
              <Eyebrow>Distribuição por risco</Eyebrow>

              {totalWithRisk === 0 ? (
                <p className="mt-3 text-sm text-ink-400">Nenhum caso classificado ainda.</p>
              ) : (
                <>
                  {/* Barra segmentada */}
                  <div
                    className="mt-4 flex overflow-hidden rounded-full"
                    style={{ height: 12 }}
                  >
                    {riskPercent("LOW") > 0 && (
                      <div
                        style={{
                          flex: riskCounts.LOW,
                          background: "var(--rai-green-500)",
                        }}
                      />
                    )}
                    {riskPercent("MEDIUM") > 0 && (
                      <div
                        style={{
                          flex: riskCounts.MEDIUM,
                          background: "var(--rai-ochre-500)",
                        }}
                      />
                    )}
                    {riskPercent("HIGH") > 0 && (
                      <div
                        style={{
                          flex: riskCounts.HIGH,
                          background: "var(--rai-clay-500)",
                        }}
                      />
                    )}
                    {riskPercent("CRITICAL") > 0 && (
                      <div
                        style={{
                          flex: riskCounts.CRITICAL,
                          background: "var(--rai-iron-600)",
                        }}
                      />
                    )}
                  </div>

                  {/* Legenda */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {(
                      [
                        ["LOW", "Baixo", "green"],
                        ["MEDIUM", "Médio", "ochre"],
                        ["HIGH", "Alto", "clay"],
                        ["CRITICAL", "Crítico", "iron"],
                      ] as const
                    ).map(([level, label, tone]) => (
                      <div key={level} className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: `var(--rai-${tone}-500)` }}
                        />
                        <span className="text-xs text-ink-500">{label}</span>
                        <span className="ml-auto font-mono text-xs font-medium text-ink-900">
                          {riskCounts[level]}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Feed de atividade recente */}
            <div className="rounded-lg bg-paper p-5 shadow-hair">
              <Eyebrow>Atividade recente</Eyebrow>
              {recentActivity.length === 0 ? (
                <p className="mt-3 text-sm text-ink-400">Nenhuma atividade registrada.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {recentActivity.map((t) => {
                    const unitId = t.case.unit?.identifier ?? ""
                    const ago = formatRelativeTime(t.createdAt)
                    return (
                      <div key={t.id} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
                          style={{
                            background: "var(--rai-azulejo-100)",
                            color: "var(--rai-azulejo-700)",
                          }}
                        >
                          <Icon name="chevR" size={10} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink-900">
                            Status alterado para{" "}
                            <StatusChip status={t.toStatus} />
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tracking-wide text-ink-400">
                            {t.case.protocol}
                            {unitId ? ` · ${unitId}` : ""} · {ago}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
