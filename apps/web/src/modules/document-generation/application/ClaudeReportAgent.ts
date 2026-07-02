import { z } from "zod"
import { renderTemplate, type TemplateId, type TemplateVariables } from "@reformai/templates"
import type { LLMMessage, LLMProvider } from "@/modules/document-intelligence/domain/LLMProvider"
import type { ReformCaseData, ReportAgent, ReportGenerationResult } from "../domain/ReportAgent"
import { logger } from "@/shared/logger"

// ─── Output validation ────────────────────────────────────────────────────────

const DISCLAIMER_MARKER = "caráter meramente informativo"

const ReportContentSchema = z
  .string()
  .min(1, "Conteúdo do relatório não pode ser vazio")
  .refine(
    (s) => s.includes(DISCLAIMER_MARKER),
    "O relatório deve conter o disclaimer obrigatório",
  )

// ─── AI enrichment types ──────────────────────────────────────────────────────

interface NarrativeFields {
  recomendacao?: string
  pendencias?: string
  instrucoes?: string
  descricao_obra?: string
}

const NarrativeSchema = z.object({
  recomendacao: z.string().optional(),
  pendencias: z.string().optional(),
  instrucoes: z.string().optional(),
  descricao_obra: z.string().optional(),
})

const NARRATIVE_OPEN_TAG = "<narrative>"
const NARRATIVE_CLOSE_TAG = "</narrative>"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson(raw: string): string | null {
  const openIdx = raw.indexOf(NARRATIVE_OPEN_TAG)
  if (openIdx === -1) return null
  const start = openIdx + NARRATIVE_OPEN_TAG.length
  const closeIdx = raw.indexOf(NARRATIVE_CLOSE_TAG, start)
  if (closeIdx === -1) return null
  return raw.slice(start, closeIdx).trim()
}

function buildNarrativePrompt(templateId: TemplateId, caseData: ReformCaseData): string {
  const { reformCase, documents } = caseData
  const scope = reformCase.reformScope
    ? JSON.stringify(reformCase.reformScope, null, 2)
    : "(não disponível)"
  const evaluation = reformCase.evaluationResult
    ? JSON.stringify(reformCase.evaluationResult, null, 2)
    : "(não disponível)"

  // Digest da análise documental (status + pendências por documento) para que
  // recomendação e pendências narradas considerem ART/RRT e demais documentos.
  const docsDigest =
    documents.length > 0
      ? documents
          .map((d) => {
            const pend = d.pendencies as {
              items?: string[]
              recommendation?: string | null
              reasoning?: string
            } | null
            const parts = [`- ${d.type} (${d.fileName}): status ${d.status}`]
            if (pend?.recommendation) parts.push(`  recomendação: ${pend.recommendation}`)
            if (pend?.items?.length) parts.push(`  pendências: ${pend.items.join("; ")}`)
            return parts.join("\n")
          })
          .join("\n")
          .slice(0, 4000)
      : "(nenhum documento enviado)"

  return [
    `Você é um analista técnico de reformas prediais. Gere texto em português para o relatório "${templateId}".`,
    "",
    "DADOS DO CASO:",
    `Protocolo: ${reformCase.protocol}`,
    `Nível de risco: ${reformCase.riskLevel ?? "não classificado"}`,
    `Requer ART/RRT: ${reformCase.requiresART ?? "não determinado"}`,
    `Score de triagem: ${reformCase.triageScore ?? "N/A"}`,
    "",
    "ESCOPO DA OBRA:",
    scope,
    "",
    "RESULTADO DA AVALIAÇÃO:",
    evaluation,
    "",
    "ANÁLISE DOCUMENTAL (status e pendências dos documentos enviados):",
    docsDigest,
    "",
    "Responda APENAS com um objeto JSON entre as tags <narrative>...</narrative>.",
    "O JSON pode ter os campos: recomendacao, pendencias, instrucoes, descricao_obra",
    '(use apenas os campos relevantes para o template "' + templateId + '").',
    "Seja objetivo, técnico e em português formal.",
    "Não invente dados. Use apenas as informações fornecidas.",
    "Não inclua texto fora das tags <narrative>...</narrative>.",
  ].join("\n")
}

// ─── Template variable builders ───────────────────────────────────────────────

const DOC_TYPE_PT: Record<string, string> = {
  ART_RRT: "ART/RRT",
  MEMORIAL: "Memorial descritivo",
  PROJECT: "Projeto",
  SCHEDULE: "Cronograma",
  WORKFORCE: "Mão de obra",
  WORKER_DOCS: "Documentos dos trabalhadores",
  AUTHORIZATION: "Autorização",
  PHOTOS: "Fotos",
  INSPECTION_REPORT: "Relatório de vistoria",
  ART_RRT_FINAL: "ART/RRT final",
  OTHER: "Outros",
}

function docLabel(doc: { type: string; fileName: string }): string {
  return `${DOC_TYPE_PT[doc.type] ?? doc.type} (${doc.fileName})`
}

const DOC_STATUS_PT: Record<string, string> = {
  PENDING: "Pendente de análise",
  PROCESSING: "Em processamento",
  VALID: "Válido",
  VALID_WITH_CAVEATS: "Válido com ressalvas",
  INVALID: "Inválido",
  MISSING: "Ausente",
}

const RECOMMENDATION_PT: Record<string, string> = {
  approve: "Aprovar",
  approve_with_caveats: "Aprovar com ressalvas",
  reject: "Reprovar",
  request_corrections: "Solicitar correções",
}

/** Estrutura persistida em Document.pendencies pelo DocumentWorker. */
interface DocPendencies {
  items?: string[]
  inconsistencies?: Array<{ description: string; severity?: string }>
  recommendation?: string | null
  reasoning?: string
}

/**
 * Consolida a análise de cada documento (status, dados extraídos,
 * inconsistências, pendências e parecer da IA) em markdown para a seção
 * "Análise documental" do relatório.
 */
function buildDocumentAnalysisSection(documents: ReformCaseData["documents"]): string {
  if (documents.length === 0) {
    return "(nenhum documento enviado até a data deste relatório)"
  }

  const blocks = documents.map((doc) => {
    const lines: string[] = [`### ${docLabel(doc)}`, ""]
    lines.push(`- **Status:** ${DOC_STATUS_PT[doc.status] ?? doc.status}`)

    const extracted = doc.extractedData as Record<string, unknown> | null
    if (extracted && Object.keys(extracted).length > 0) {
      const fields = Object.entries(extracted)
        .filter(([, v]) => v != null && typeof v !== "object")
        .slice(0, 20)
        .map(([k, v]) => `  - ${k}: ${String(v)}`)
      if (fields.length > 0) {
        lines.push("- **Dados extraídos:**", ...fields)
      }
    }

    const pend = doc.pendencies as DocPendencies | null
    if (pend) {
      if (pend.inconsistencies && pend.inconsistencies.length > 0) {
        lines.push(
          "- **Inconsistências:**",
          ...pend.inconsistencies.map(
            (inc) => `  - ${inc.description}${inc.severity ? ` (severidade: ${inc.severity})` : ""}`,
          ),
        )
      }
      if (pend.items && pend.items.length > 0) {
        lines.push("- **Pendências:**", ...pend.items.map((p) => `  - ${p}`))
      }
      if (pend.recommendation) {
        lines.push(
          `- **Parecer da análise:** ${RECOMMENDATION_PT[pend.recommendation] ?? pend.recommendation}`,
        )
      }
      if (pend.reasoning) {
        lines.push(`- **Justificativa:** ${pend.reasoning}`)
      }
    }

    return lines.join("\n")
  })

  return blocks.join("\n\n")
}

const CONVERSATION_ROLE_PT: Record<string, string> = {
  USER: "Morador",
  ASSISTANT: "Assistente",
}

const MAX_CONVERSATION_MESSAGES = 200
const MAX_MESSAGE_CHARS = 800

/**
 * Formata a conversa de triagem para o anexo do relatório. Mensagens SYSTEM
 * são omitidas; mensagens longas são truncadas para manter o PDF legível.
 */
function buildConversationSection(messages: ReformCaseData["messages"]): string {
  const visible = (messages ?? []).filter((m) => m.role !== "SYSTEM")
  if (visible.length === 0) {
    return "(nenhuma interação registrada na triagem)"
  }

  const capped = visible.slice(0, MAX_CONVERSATION_MESSAGES)
  const lines = capped.map((m) => {
    const who = CONVERSATION_ROLE_PT[m.role] ?? m.role
    const when = new Date(m.createdAt).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    })
    const text =
      m.content.length > MAX_MESSAGE_CHARS
        ? `${m.content.slice(0, MAX_MESSAGE_CHARS)} […]`
        : m.content
    return `**${who}** (${when}): ${text.replace(/\n+/g, " ")}`
  })

  if (visible.length > capped.length) {
    lines.push(`_(${visible.length - capped.length} mensagens omitidas por limite de tamanho)_`)
  }

  return lines.join("\n\n")
}

function buildBaseVariables(
  templateId: TemplateId,
  caseData: ReformCaseData,
  narrative: NarrativeFields,
): TemplateVariables {
  const { reformCase, documents, relations } = caseData
  const now = new Date().toLocaleDateString("pt-BR")

  const evaluation = reformCase.evaluationResult as Record<string, unknown> | null
  const scope = reformCase.reformScope as Record<string, unknown> | null

  // Regras acionadas (avaliação determinística)
  const triggeredRules = evaluation?.triggeredRules as Array<{
    ruleName: string
    reason: string
  }> | null
  const regrasAtivadas =
    triggeredRules && triggeredRules.length > 0
      ? triggeredRules.map((r) => `- **${r.ruleName}**: ${r.reason}`).join("\n")
      : "(nenhuma regra acionada)"

  // Serviços do escopo
  const services = scope?.services as string[] | null
  const servicosText =
    services && services.length > 0
      ? services.map((s) => `- ${s}`).join("\n")
      : scope?.description
        ? String(scope.description)
        : "(não especificado)"

  // Campos derivados do escopo
  const areasAffected = scope?.areasAffected as string[] | null
  const estimatedArea = scope?.estimatedArea as number | null
  const areaAfetada =
    areasAffected && areasAffected.length > 0
      ? areasAffected.join(", ")
      : estimatedArea
        ? `${estimatedArea} m²`
        : undefined
  const durationDays = scope?.estimatedDurationDays as number | null
  const prazoExecucao = durationDays ? `${durationDays} dias` : undefined
  const etapas =
    services && services.length > 0
      ? services.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : undefined

  // Documentos: válidos x pendentes + inconsistências
  const validDocs = documents.filter((d) => d.status === "VALID" || d.status === "VALID_WITH_CAVEATS")
  const pendingDocs = documents.filter(
    (d) => d.status === "PENDING" || d.status === "PROCESSING" || d.status === "INVALID" || d.status === "MISSING",
  )
  const documentosValidos =
    validDocs.length > 0 ? validDocs.map((d) => `- ${docLabel(d)}`).join("\n") : undefined
  const documentosPendentes =
    pendingDocs.length > 0 ? pendingDocs.map((d) => `- ${docLabel(d)}`).join("\n") : undefined
  const inconsistenciasList = documents.flatMap((d) => {
    const p = d.pendencies as { inconsistencies?: Array<{ description: string }> } | null
    return p?.inconsistencies?.map((inc) => `- ${inc.description}`) ?? []
  })
  const inconsistencias = inconsistenciasList.length > 0 ? inconsistenciasList.join("\n") : undefined

  // Relações resolvidas (nomes em vez de IDs)
  const partner = relations?.partner ?? null
  const plan = relations?.plan ?? null

  const base: TemplateVariables = {
    protocolo: reformCase.protocol,
    data: now,
    data_analise: now,
    condominio: relations?.condominiumName ?? reformCase.condominiumId,
    unidade: relations?.unitLabel ?? reformCase.unitId,
    proprietario: relations?.clientName ?? reformCase.clientId,
    risco: reformCase.riskLevel ?? undefined,
    score_triagem: reformCase.triageScore ?? undefined,
    requer_art: reformCase.requiresART != null ? (reformCase.requiresART ? "Sim" : "Não") : undefined,
    servicos: servicosText,
    regras_ativadas: regrasAtivadas,
    // narrative fields (AI-enriched or empty → engine substitutes placeholder)
    recomendacao: narrative.recomendacao,
    pendencias: narrative.pendencias,
    instrucoes: narrative.instrucoes,
    descricao_obra: narrative.descricao_obra,
  }

  // Template-specific fields
  if (templateId === "proposta-comercial") {
    Object.assign(base, {
      plano: plan?.name,
      valor_base: plan ? `R$ ${plan.basePrice}` : undefined,
      vistorias_inclusas: "3",
      valor_vistoria_extra: plan ? `R$ ${plan.extraInspectionPrice}` : undefined,
      servicos_inclusos: servicosText,
      validade_proposta: "30 dias",
      forma_pagamento: undefined,
    })
  }

  if (templateId === "ordem-servico") {
    Object.assign(base, {
      parceiro: partner?.name,
      crea_parceiro: partner?.creaNumber,
      servicos_autorizados: servicosText,
      data_inicio: undefined,
      restricoes_horario: undefined,
      contato_sindico: relations?.sindicoContact?.name,
    })
  }

  if (templateId === "memorial-descritivo") {
    Object.assign(base, {
      responsavel_tecnico: partner?.name,
      materiais: undefined,
      area_afetada: areaAfetada,
      prazo_execucao: prazoExecucao,
    })
  }

  if (templateId === "cronograma-basico") {
    Object.assign(base, {
      responsavel_execucao: partner?.name,
      data_inicio_prevista: undefined,
      duracao_dias: durationDays ?? undefined,
      etapas,
    })
  }

  if (templateId === "parecer-pendencias") {
    Object.assign(base, {
      documentos_validos: documentosValidos,
      documentos_pendentes: documentosPendentes,
      inconsistencias,
      prazo_correcao: "15 dias corridos",
      nome_responsavel: partner?.name,
    })
  }

  if (templateId === "relatorio-analise") {
    Object.assign(base, {
      nome_responsavel: partner?.name,
      analise_documentos: buildDocumentAnalysisSection(documents),
      historico_conversa: buildConversationSection(caseData.messages),
    })
  }

  return base
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ClaudeReportAgent implements ReportAgent {
  constructor(private readonly llm: LLMProvider) {}

  async generateReport(
    templateId: TemplateId,
    caseData: ReformCaseData,
    options?: { enrichWithAI?: boolean },
  ): Promise<ReportGenerationResult> {
    let narrative: NarrativeFields = {}

    if (options?.enrichWithAI) {
      narrative = await this.enrichWithAI(templateId, caseData)
    }

    const variables = buildBaseVariables(templateId, caseData, narrative)
    const content = renderTemplate(templateId, variables)

    const validation = ReportContentSchema.safeParse(content)
    if (!validation.success) {
      logger.error("report.agent.validation_failed", {
        caseId: caseData.reformCase.id,
        tenantId: caseData.reformCase.tenantId,
        message: validation.error.message,
      })
      throw new Error(`Relatório gerado é inválido: ${validation.error.message}`)
    }

    return { content: validation.data, templateUsed: templateId }
  }

  private async enrichWithAI(
    templateId: TemplateId,
    caseData: ReformCaseData,
  ): Promise<NarrativeFields> {
    const systemPrompt =
      "Você é um analista técnico de reformas prediais. " +
      "Gere texto técnico em português para campos narrativos de relatórios. " +
      "Responda APENAS com JSON entre as tags <narrative>...</narrative>."

    const messages: LLMMessage[] = [
      { role: "user", content: buildNarrativePrompt(templateId, caseData) },
    ]

    let raw: string
    try {
      raw = await this.llm.complete(messages, { system: systemPrompt, maxTokens: 1500, temperature: 0.2 })
    } catch (err) {
      logger.warn("report.agent.llm_error", {
        caseId: caseData.reformCase.id,
        message: (err as Error).message,
      })
      return {}
    }

    const json = extractJson(raw)
    if (json === null) {
      logger.warn("report.agent.no_narrative_tags", { caseId: caseData.reformCase.id })
      return {}
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      logger.warn("report.agent.narrative_json_invalid", { caseId: caseData.reformCase.id })
      return {}
    }

    const result = NarrativeSchema.safeParse(parsed)
    if (!result.success) {
      logger.warn("report.agent.narrative_schema_invalid", { caseId: caseData.reformCase.id })
      return {}
    }

    return result.data
  }
}
