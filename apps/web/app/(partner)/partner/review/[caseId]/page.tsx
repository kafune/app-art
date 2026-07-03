import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { ReviewDecisionForm } from "@/interfaces/components/review/ReviewDecisionForm"
import { ReviewDocumentList } from "@/interfaces/components/review/ReviewDocumentList"
import {
  AiAnalysisCard,
  extractAiAnalysis,
} from "@/interfaces/components/review/AiAnalysisCard"
import { TopBar, Eyebrow, Badge, RiskBadge, StatusChip, Card } from "@/interfaces/components/ui"

export const dynamic = "force-dynamic"

interface ReformScope {
  services?: string[]
  areas?: string[]
  description?: string
}

export default async function PartnerReviewCasePage({
  params,
}: {
  params: { caseId: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "PARTNER") redirect("/cases")

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, active: true },
  })
  if (!partner || !partner.active) redirect("/partner/dashboard")

  const reformCase = await prisma.reformCase.findFirst({
    where: { id: params.caseId, tenantId: user.tenantId },
    include: {
      condominium: { select: { name: true } },
      unit: { select: { identifier: true } },
      documents: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          status: true,
          type: true,
          pendencies: true,
        },
        orderBy: { uploadedAt: "desc" },
      },
    },
  })

  if (!reformCase) notFound()

  const scope = reformCase.reformScope as ReformScope | null
  const aiAnalysis = extractAiAnalysis(reformCase.documents)

  // Parecer já emitido (caso fora de HUMAN_REVIEW_REQUIRED): exibe em modo
  // leitura para o revisor consultar depois — o caso não "some" após a decisão.
  const lastReview =
    reformCase.status === "HUMAN_REVIEW_REQUIRED"
      ? null
      : await prisma.caseTransitionLog.findFirst({
          where: {
            caseId: reformCase.id,
            fromStatus: "HUMAN_REVIEW_REQUIRED",
            triggeredBy: { startsWith: "reviewer:" },
          },
          orderBy: { createdAt: "desc" },
          select: { toStatus: true, reason: true, createdAt: true, triggeredBy: true },
        })

  return (
    <>
      <TopBar
        breadcrumb={["Revisão técnica", reformCase.protocol]}
        title={`Parecer técnico — ${reformCase.protocol}`}
        subtitle={`${reformCase.condominium.name} · Un. ${reformCase.unit.identifier}`}
        actions={
          <Link
            href="/partner/review"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-bone-200"
          >
            ← Voltar
          </Link>
        }
      />

      <div className="flex-1 overflow-auto bg-bone-50 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Hero card */}
          <Card className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:gap-8" padded>
            <div>
              <div className="flex items-center gap-3">
                <Eyebrow>Protocolo</Eyebrow>
                <span className="font-mono text-sm font-medium text-ink-900">
                  {reformCase.protocol}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-snug text-ink-900">
                {reformCase.condominium.name} · Un.&nbsp;{reformCase.unit.identifier}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-3">
              <StatusChip status={reformCase.status} />
              {reformCase.riskLevel && (
                <RiskBadge
                  level={reformCase.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                  score={reformCase.triageScore ?? undefined}
                />
              )}
            </div>
          </Card>

          {/* Reform scope */}
          {scope && (
            <Card padded>
              <h2 className="mb-4 text-sm font-semibold tracking-snug text-ink-900">
                Escopo da reforma
              </h2>
              {scope.services && scope.services.length > 0 && (
                <div className="mb-4">
                  <Eyebrow className="mb-2">Serviços</Eyebrow>
                  <ul className="flex flex-wrap gap-1.5">
                    {scope.services.map((s) => (
                      <li key={s}>
                        <Badge tone="neutral">{s}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scope.areas && scope.areas.length > 0 && (
                <div className="mb-4">
                  <Eyebrow className="mb-2">Áreas</Eyebrow>
                  <ul className="flex flex-wrap gap-1.5">
                    {scope.areas.map((a) => (
                      <li key={a}>
                        <Badge tone="neutral">{a}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scope.description && (
                <div>
                  <Eyebrow className="mb-2">Descrição</Eyebrow>
                  <p className="text-sm leading-relaxed text-ink-700">{scope.description}</p>
                </div>
              )}
            </Card>
          )}

          {/* AI document analysis */}
          {aiAnalysis && <AiAnalysisCard analysis={aiAnalysis} />}

          {/* Documents */}
          <Card padded>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-snug text-ink-900">
                Documentos do caso
              </h2>
              <Eyebrow>{reformCase.documents.length} arquivo(s)</Eyebrow>
            </div>
            <ReviewDocumentList
              caseId={reformCase.id}
              documents={reformCase.documents.map(({ id, fileName, mimeType, status, type }) => ({
                id,
                fileName,
                mimeType,
                status,
                type,
              }))}
            />
          </Card>

          {/* Decision form — só quando o caso está aguardando revisão */}
          {reformCase.status === "HUMAN_REVIEW_REQUIRED" ? (
            <Card padded>
              <h2 className="mb-5 text-sm font-semibold tracking-snug text-ink-900">
                Registrar parecer técnico
              </h2>
              <ReviewDecisionForm caseId={reformCase.id} redirectTo="/partner/review" />
            </Card>
          ) : lastReview ? (
            <Card padded>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-snug text-ink-900">
                  Parecer registrado
                  {lastReview.triggeredBy === `reviewer:${user.id}` && " por você"}
                </h2>
                <div className="flex items-center gap-3">
                  <StatusChip status={lastReview.toStatus} />
                  <span className="font-mono text-xs text-ink-400">
                    {new Date(lastReview.createdAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              </div>
              {lastReview.reason && (
                <p className="whitespace-pre-wrap rounded-sm bg-bone-50 px-4 py-3 text-sm leading-relaxed text-ink-700">
                  {lastReview.reason}
                </p>
              )}
            </Card>
          ) : (
            <Card padded>
              <p className="text-sm text-ink-500">
                Este caso não está aguardando revisão técnica no momento.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
