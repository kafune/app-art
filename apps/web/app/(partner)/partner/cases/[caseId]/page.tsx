import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { CaseStatus, RiskLevel } from "@reformai/database"
import { DocumentViewButton } from "./DocumentViewButton"
import { AcceptDeclineButtons } from "./AcceptDeclineButtons"
import {
  TopBar,
  Card,
  Eyebrow,
  Badge,
  RiskBadge,
  StatusChip,
  Icon,
} from "@/interfaces/components/ui"

export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "Rascunho",
  AWAITING_SCOPE_DETAILS: "Aguardando detalhes",
  SCOPE_CLASSIFIED: "Escopo classificado",
  AWAITING_SYNDIC_APPROVAL: "Aguardando síndico",
  AWAITING_DOCUMENTS: "Aguardando documentos",
  DOCUMENTS_UNDER_REVIEW: "Documentos em revisão",
  PENDING_CORRECTIONS: "Correções pendentes",
  ELIGIBLE_FOR_RELEASE: "Elegível para liberação",
  RELEASED_WITH_CONDITIONS: "Liberado com condições",
  HUMAN_REVIEW_REQUIRED: "Revisão humana exigida",
  COMMERCIAL_OFFER_SENT: "Proposta enviada",
  AWAITING_PAYMENT: "Aguardando pagamento",
  ASSIGNED_TO_PARTNER: "Atribuído ao parceiro",
  ART_RRT_PENDING: "ART/RRT pendente",
  INSPECTIONS_SCHEDULED: "Vistorias agendadas",
  IN_EXECUTION: "Em execução",
  CONCLUDED: "Concluído",
  ARCHIVED: "Arquivado",
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  ANALYSIS: "Análise",
  TECHNICAL_OPINION: "Parecer técnico",
  COMMERCIAL_PROPOSAL: "Proposta comercial",
  SERVICE_ORDER: "Ordem de serviço",
  INSPECTION_SUMMARY: "Resumo de vistoria",
  RELEASE_OPINION: "Parecer de liberação",
  MEMORIAL_DESCRITIVO: "Memorial descritivo",
  CRONOGRAMA: "Cronograma",
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Inicial",
  INTERMEDIATE: "Intermediária",
  FINAL: "Final",
  EXTRA: "Extra",
  CRITICAL_SYSTEM: "Sistema crítico",
}

const INSPECTION_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  try {
    return new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return String(date)
  }
}

interface ReformScope {
  services?: string[]
  areas?: string[]
  description?: string
}

interface EvaluationResult {
  recommendedStatus?: string
}

export default async function PartnerCaseDetailPage({
  params,
}: {
  params: { caseId: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "PARTNER") redirect("/cases")

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, tenantId: true },
  })

  if (!partner) redirect("/partner/cases")

  // Casos atribuídos ao parceiro + casos de condomínios onde ele é o
  // parceiro técnico fixo (acompanhamento, sem ações de aceite).
  const reformCase = await prisma.reformCase.findFirst({
    where: {
      id: params.caseId,
      tenantId: user.tenantId,
      OR: [{ partnerId: partner.id }, { condominium: { partnerId: partner.id } }],
    },
    include: {
      condominium: { select: { name: true, address: true, city: true, state: true } },
      unit: { select: { identifier: true } },
      documents: {
        select: {
          id: true,
          fileName: true,
          type: true,
          status: true,
          uploadedAt: true,
          version: true,
          mimeType: true,
        },
        orderBy: { uploadedAt: "desc" },
      },
      reports: {
        select: { id: true, type: true, version: true, generatedAt: true },
        orderBy: { generatedAt: "desc" },
      },
      inspections: {
        select: {
          id: true,
          type: true,
          scheduledAt: true,
          completedAt: true,
          status: true,
          notes: true,
        },
        orderBy: { scheduledAt: "asc" },
      },
      transitions: {
        select: { fromStatus: true, toStatus: true, triggeredBy: true, reason: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!reformCase) notFound()

  const scope = reformCase.reformScope as ReformScope | null
  const evaluation = reformCase.evaluationResult as EvaluationResult | null

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={["Meus Casos", reformCase.protocol]}
        title={`${reformCase.condominium.name} · Un. ${reformCase.unit.identifier}`}
        subtitle={STATUS_LABELS[reformCase.status as CaseStatus] ?? reformCase.status}
      />

      <div className="flex-1 bg-bone-50 p-4 md:p-8 space-y-6">
        {/* Hero card */}
        <Card className="!p-7">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
            {/* Left: meta */}
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <span className="font-mono text-xs text-ink-500 tracking-wide uppercase">
                  Protocolo
                </span>
                <span className="font-mono text-sm font-medium text-ink-900">
                  {reformCase.protocol}
                </span>
                <span className="w-1 h-1 rounded-full bg-ink-300" />
                <span className="text-xs text-ink-500">
                  Criado em {formatDate(reformCase.createdAt)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 items-center mb-4">
                <StatusChip status={reformCase.status} />
                {reformCase.riskLevel && (
                  <RiskBadge
                    level={reformCase.riskLevel as RiskLevel}
                    score={reformCase.triageScore ?? undefined}
                  />
                )}
              </div>

              <h2 className="text-xl font-semibold text-ink-900 tracking-snug mb-1">
                {reformCase.condominium.name}
              </h2>
              <p className="text-sm text-ink-500">
                {reformCase.condominium.address}, {reformCase.condominium.city} —{" "}
                {reformCase.condominium.state}
              </p>

              {scope?.services && scope.services.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {scope.services.map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}

              {scope?.description && (
                <p className="mt-4 text-sm text-ink-700 leading-relaxed">
                  {scope.description}
                </p>
              )}
            </div>

            {/* Right: facts */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 border-b border-divider pb-4 sm:grid-cols-2">
                {reformCase.triageScore !== null && (
                  <div>
                    <Eyebrow>Score de triagem</Eyebrow>
                    <div className="mt-1.5 font-mono text-2xl font-semibold text-ink-900">
                      {reformCase.triageScore}
                      <span className="text-sm text-ink-400 font-normal">/100</span>
                    </div>
                  </div>
                )}
                {reformCase.requiresART !== null && (
                  <div>
                    <Eyebrow>ART/RRT</Eyebrow>
                    <div className="mt-1.5 text-sm font-medium text-ink-900">
                      {reformCase.requiresART ? "Exigida" : "Não exigida"}
                    </div>
                    <div className="text-xs text-ink-500">Emissão externa</div>
                  </div>
                )}
                {evaluation?.recommendedStatus && (
                  <div>
                    <Eyebrow>Status recomendado</Eyebrow>
                    <div className="mt-1.5 text-sm font-medium text-ink-900">
                      {STATUS_LABELS[evaluation.recommendedStatus as CaseStatus] ??
                        evaluation.recommendedStatus}
                    </div>
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="rounded-md border border-dashed border-bone-400 bg-bone-100 p-4">
                <Eyebrow className="mb-2">Disclaimer</Eyebrow>
                <p className="text-xs text-ink-600 leading-relaxed">
                  A plataforma <strong>prepara, organiza e encaminha</strong> — a{" "}
                  <strong>emissão da ART/RRT é sua responsabilidade técnica</strong> como
                  profissional habilitado. A ReformAI não substitui o ato de emissão formal.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Ação necessária: aceitar/recusar — só para o parceiro atribuído */}
        {reformCase.status === CaseStatus.ASSIGNED_TO_PARTNER && reformCase.partnerId === partner.id && (
          <div className="relative overflow-hidden rounded-lg bg-ink-900 p-6 text-bone-50">
            {/* Decorative rings */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-72 opacity-10">
              <svg width="288" height="100%" viewBox="0 0 288 200" fill="none">
                <circle cx="220" cy="100" r="160" stroke="var(--rai-green-300)" strokeWidth="1" />
                <circle cx="220" cy="100" r="100" stroke="var(--rai-green-300)" strokeWidth="1" />
                <circle cx="220" cy="100" r="50" stroke="var(--rai-green-300)" strokeWidth="1" />
              </svg>
            </div>
            <div className="relative flex flex-wrap items-center gap-3 mb-3">
              <Badge tone="greenSolid">Nova atribuição</Badge>
            </div>
            <h3 className="relative text-lg font-semibold mb-2">Ação necessária</h3>
            <p className="relative text-sm text-ink-200 mb-5 max-w-xl leading-relaxed">
              Este caso foi atribuído a você. Aceite ou recuse para continuar.
            </p>
            <div className="relative">
              <AcceptDeclineButtons partnerId={partner.id} caseId={reformCase.id} />
            </div>
          </div>
        )}

        {/* ART/RRT pending alert */}
        {reformCase.status === CaseStatus.ART_RRT_PENDING && (
          <div className="rounded-lg bg-ochre-100 border border-ochre-300 p-5">
            <div className="flex items-start gap-3">
              <Icon name="alert" size={16} className="text-ochre-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-ochre-700 mb-1">ART/RRT pendente</h3>
                <p className="text-sm text-ochre-700 mb-3">
                  Para iniciar o cronograma de vistorias, agende a primeira vistoria pela aba
                  &ldquo;Vistorias&rdquo;. A transição para &ldquo;Vistorias agendadas&rdquo; ocorre
                  automaticamente ao agendar.
                </p>
                <Link
                  href={`/partner/cases/${reformCase.id}/inspections`}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-ochre-600 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-ochre-700"
                >
                  Ir para Vistorias
                  <Icon name="arrow" size={14} />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* Left column: Documents + Timeline */}
          <div className="space-y-6">
            {/* Documents */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-ink-900 tracking-snug">
                  Documentos
                </h2>
                <Eyebrow>{reformCase.documents.length} arquivo(s)</Eyebrow>
              </div>

              {reformCase.documents.length === 0 ? (
                <p className="text-sm text-ink-400">Nenhum documento enviado.</p>
              ) : (
                <ul className="divide-y divide-divider">
                  {reformCase.documents.map((doc) => {
                    const toneMap: Record<string, string> = {
                      VALID: "green",
                      VALID_WITH_CAVEATS: "ochre",
                      INVALID: "iron",
                      PENDING: "neutral",
                      PROCESSING: "azulejo",
                      MISSING: "clay",
                    }
                    const tone = toneMap[doc.status] ?? "neutral"
                    return (
                      <li
                        key={doc.id}
                        className="py-3.5 flex flex-wrap items-center gap-3"
                      >
                        <div
                          className="w-9 h-9 rounded-sm flex items-center justify-center shrink-0"
                          style={{
                            background: `var(--rai-${tone === "neutral" ? "bone" : tone}-100)`,
                            color: `var(--rai-${tone === "neutral" ? "ink-500" : tone + "-700"})`,
                          }}
                        >
                          <Icon name="doc" size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900 truncate">
                            {doc.fileName}
                          </p>
                          <p className="font-mono text-xs text-ink-400 mt-0.5">
                            {doc.type} · v{doc.version} · {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                        <Badge
                          tone={
                            tone === "green"
                              ? "green"
                              : tone === "ochre"
                                ? "ochre"
                                : tone === "iron"
                                  ? "iron"
                                  : tone === "azulejo"
                                    ? "azulejo"
                                    : "neutral"
                          }
                        >
                          {doc.status}
                        </Badge>
                        <DocumentViewButton caseId={reformCase.id} documentId={doc.id} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            {/* Transition history */}
            {reformCase.transitions.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-ink-900 tracking-snug">
                    Histórico de status
                  </h2>
                  <span className="font-mono text-xs text-ink-400 tracking-wide">
                    {reformCase.transitions.length} TRANSIÇÕES
                  </span>
                </div>
                <ul className="space-y-3">
                  {reformCase.transitions.map((t, i) => (
                    <li key={i} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="font-mono text-ink-400 shrink-0 pt-px">
                        {formatDate(t.createdAt)}
                      </span>
                      <span className="text-ink-700">
                        {STATUS_LABELS[t.fromStatus as CaseStatus] ?? t.fromStatus}
                        {" → "}
                        {STATUS_LABELS[t.toStatus as CaseStatus] ?? t.toStatus}
                      </span>
                      {t.reason && (
                        <span className="text-ink-400">— {t.reason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* Right column: Reports + Inspections */}
          <div className="space-y-6">
            {/* Reports */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-ink-900 tracking-snug">
                  Relatórios
                </h2>
                <Eyebrow>{reformCase.reports.length} gerado(s)</Eyebrow>
              </div>

              {reformCase.reports.length === 0 ? (
                <p className="text-sm text-ink-400">Nenhum relatório gerado.</p>
              ) : (
                <ul className="divide-y divide-divider">
                  {reformCase.reports.map((report) => (
                    <li
                      key={report.id}
                      className="py-3.5 flex flex-wrap items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-900">
                          {REPORT_TYPE_LABELS[report.type] ?? report.type}
                        </p>
                        <p className="font-mono text-xs text-ink-400 mt-0.5">
                          v{report.version} · {formatDate(report.generatedAt)}
                        </p>
                      </div>
                      <ReportViewButton caseId={reformCase.id} reportId={report.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Inspections */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-ink-900 tracking-snug">
                  Vistorias
                </h2>
                <Link
                  href={`/partner/cases/${reformCase.id}/inspections`}
                  className="text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
                >
                  Gerenciar →
                </Link>
              </div>

              {reformCase.inspections.length === 0 ? (
                <p className="text-sm text-ink-400">Nenhuma vistoria registrada.</p>
              ) : (
                <div className="space-y-2.5">
                  {reformCase.inspections.map((insp) => {
                    const inspStatusColors: Record<string, string> = {
                      SCHEDULED: "bg-azulejo-100 text-azulejo-700",
                      COMPLETED: "bg-green-100 text-green-700",
                      CANCELLED: "bg-iron-100 text-iron-600",
                      RESCHEDULED: "bg-ochre-100 text-ochre-700",
                    }
                    return (
                      <div
                        key={insp.id}
                        className="grid grid-cols-[52px_1fr] gap-3 rounded-sm bg-bone-50 p-3"
                      >
                        <div className="rounded bg-surface py-1.5 text-center">
                          <div className="font-mono text-xs text-ink-400">
                            {formatDate(insp.scheduledAt).split(" ")[0]}
                          </div>
                          <div className="text-xs font-medium text-ink-900 mt-0.5">
                            {formatDate(insp.scheduledAt).split(" ")[1] ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${inspStatusColors[insp.status] ?? "bg-bone-200 text-ink-600"}`}
                            >
                              {INSPECTION_STATUS_LABELS[insp.status] ?? insp.status}
                            </span>
                          </div>
                          <div className="text-sm text-ink-900 font-medium">
                            {INSPECTION_TYPE_LABELS[insp.type] ?? insp.type}
                          </div>
                          {insp.notes && (
                            <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">
                              {insp.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// Small client component for opening report signed URL
function ReportViewButton({ caseId, reportId }: { caseId: string; reportId: string }) {
  return <DocumentViewButton caseId={caseId} documentId={reportId} isReport />
}
