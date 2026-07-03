import Link from "next/link"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { TopBar, RiskBadge, Eyebrow, StatusChip } from "@/interfaces/components/ui"

export const dynamic = "force-dynamic"

export default async function PartnerReviewQueuePage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "PARTNER") redirect("/cases")

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, active: true },
  })
  if (!partner || !partner.active) redirect("/partner/dashboard")

  const cases = await prisma.reformCase.findMany({
    where: { tenantId: user.tenantId, status: "HUMAN_REVIEW_REQUIRED" },
    include: {
      condominium: { select: { name: true } },
      unit: { select: { identifier: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  })

  // Pareceres já emitidos por este revisor — o caso muda de status após a
  // decisão e sai da fila; sem esta lista ele sumiria da área do parceiro.
  const reviewedTransitions = await prisma.caseTransitionLog.findMany({
    where: {
      triggeredBy: `reviewer:${user.id}`,
      case: { tenantId: user.tenantId },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      case: {
        select: {
          id: true,
          protocol: true,
          status: true,
          condominium: { select: { name: true } },
          unit: { select: { identifier: true } },
        },
      },
    },
  })
  // Uma linha por caso (parecer mais recente)
  const reviewed = [
    ...new Map(reviewedTransitions.map((t) => [t.case.id, t])).values(),
  ].slice(0, 20)

  return (
    <>
      <TopBar
        title="Revisão técnica"
        subtitle={`${cases.length} caso(s) aguardando parecer do responsável técnico`}
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-4 py-6 md:px-8 md:py-8">
        {cases.length === 0 ? (
          <div className="rounded-lg bg-surface p-12 text-center shadow-hair">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <span className="h-3 w-3 rounded-full bg-green-500" />
            </div>
            <p className="text-sm font-medium text-ink-700">Fila vazia</p>
            <p className="mt-1 text-sm text-ink-400">
              Nenhum caso aguardando revisão técnica no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-hair">
            <div className="grid min-w-[680px] grid-cols-[120px_1fr_160px_120px_90px] items-center gap-4 border-b border-divider bg-bone-50 px-5 py-3">
              <Eyebrow>Protocolo</Eyebrow>
              <Eyebrow>Condomínio · Unidade</Eyebrow>
              <Eyebrow>Risco</Eyebrow>
              <Eyebrow>Atualizado em</Eyebrow>
              <span />
            </div>
            <div className="divide-y divide-divider">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="grid min-w-[680px] grid-cols-[120px_1fr_160px_120px_90px] items-center gap-4 px-5 py-4 transition-colors hover:bg-bone-50"
                  data-testid="partner-review-item"
                >
                  <span className="font-mono text-xs font-medium text-ink-500">{c.protocol}</span>
                  <div>
                    <div className="text-sm font-medium text-ink-900">{c.condominium.name}</div>
                    <div className="mt-0.5 text-xs text-ink-500">Un.&nbsp;{c.unit.identifier}</div>
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
                  <span className="font-mono text-xs text-ink-500">
                    {new Date(c.updatedAt).toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex justify-end">
                    <Link
                      href={`/partner/review/${c.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ink-900 px-3 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-bone-50"
                      data-testid="partner-review-link"
                    >
                      Revisar →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pareceres já emitidos por este revisor */}
        {reviewed.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Revisados por mim</h2>
            <div className="overflow-x-auto rounded-lg bg-surface shadow-hair">
              <div className="grid min-w-[680px] grid-cols-[120px_1fr_170px_120px_90px] items-center gap-4 border-b border-divider bg-bone-50 px-5 py-3">
                <Eyebrow>Protocolo</Eyebrow>
                <Eyebrow>Condomínio · Unidade</Eyebrow>
                <Eyebrow>Resultado</Eyebrow>
                <Eyebrow>Parecer em</Eyebrow>
                <span />
              </div>
              <div className="divide-y divide-divider">
                {reviewed.map((t) => (
                  <div
                    key={t.id}
                    className="grid min-w-[680px] grid-cols-[120px_1fr_170px_120px_90px] items-center gap-4 px-5 py-4 transition-colors hover:bg-bone-50"
                    data-testid="partner-reviewed-item"
                  >
                    <span className="font-mono text-xs font-medium text-ink-500">
                      {t.case.protocol}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-ink-900">
                        {t.case.condominium?.name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        Un.&nbsp;{t.case.unit?.identifier ?? "—"}
                      </div>
                    </div>
                    <StatusChip status={t.toStatus} />
                    <span className="font-mono text-xs text-ink-500">
                      {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex justify-end">
                      <Link
                        href={`/partner/review/${t.case.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-bone-200"
                      >
                        Ver →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
