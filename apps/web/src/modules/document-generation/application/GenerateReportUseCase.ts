import type { ReportType, Report, Document } from "@reformai/database"
import type { TemplateId } from "@reformai/templates"
import { NotFoundError } from "@/shared/errors/DomainError"
import { logger } from "@/shared/logger"
import type { StorageAdapter } from "@/infrastructure/storage/StorageAdapter"
import { buildStorageKey } from "@/infrastructure/storage/StorageAdapter"
import { SIGNED_URL_TTL_SECONDS } from "@/infrastructure/storage/StorageFactory"
import type { ReformCaseRepository } from "@/modules/case-intake/domain/repositories/ReformCaseRepository"
import type { DocumentRepository } from "@/modules/document-management/domain/repositories/DocumentRepository"
import type { ReportAgent, CaseRelations } from "../domain/ReportAgent"
import type { ReportRepository } from "../infrastructure/PrismaReportRepository"

// ─── ReportType → TemplateId mapping ─────────────────────────────────────────

const REPORT_TYPE_TO_TEMPLATE: Record<ReportType, TemplateId> = {
  ANALYSIS: "relatorio-analise",
  TECHNICAL_OPINION: "parecer-pendencias",
  COMMERCIAL_PROPOSAL: "proposta-comercial",
  SERVICE_ORDER: "ordem-servico",
  INSPECTION_SUMMARY: "relatorio-analise",
  RELEASE_OPINION: "parecer-pendencias",
  MEMORIAL_DESCRITIVO: "memorial-descritivo",
  CRONOGRAMA: "cronograma-basico",
}

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface GenerateReportInput {
  caseId: string
  tenantId: string
  reportType: ReportType
  generatedBy: string
  enrichWithAI?: boolean
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export interface GenerateReportDeps {
  caseRepo: ReformCaseRepository
  docRepo: DocumentRepository
  reportRepo: ReportRepository
  storage: StorageAdapter
  reportAgent: ReportAgent
  /**
   * Resolve nomes/relações do caso (condomínio, unidade, proprietário,
   * parceiro, plano, síndico). Opcional: sem ele, os relatórios caem para
   * os IDs crus. A rota injeta uma implementação Prisma.
   */
  loadRelations?: (caseId: string, tenantId: string) => Promise<CaseRelations>
}

// ─── Use Case ────────────────────────────────────────────────────────────────

export class GenerateReportUseCase {
  constructor(private readonly deps: GenerateReportDeps) {}

  async execute(input: GenerateReportInput): Promise<Report> {
    const { caseId, tenantId, reportType, generatedBy, enrichWithAI = false } = input
    const { caseRepo, docRepo, reportRepo, storage, reportAgent, loadRelations } = this.deps

    // 1. Fetch the case (enforces tenant isolation)
    const reformCase = await caseRepo.findById(caseId, tenantId)
    if (!reformCase) throw new NotFoundError("ReformCase", caseId)

    // 2. Fetch documents for context
    const documents = await docRepo.findByCaseId(caseId, tenantId)

    // 2b. Resolve nomes/relações (opcional)
    const relations = loadRelations ? await loadRelations(caseId, tenantId) : undefined

    // 3. Map ReportType → TemplateId
    const templateId = REPORT_TYPE_TO_TEMPLATE[reportType]

    // 3b. O relatório de análise consolida também a conversa de triagem
    const messages =
      templateId === "relatorio-analise"
        ? await caseRepo.listMessages(caseId, tenantId)
        : undefined

    logger.info("report.generate.start", {
      tenantId,
      caseId,
      reportType,
      templateId,
      enrichWithAI,
      userId: generatedBy,
    })

    // 4. Generate report content via the agent
    const { content } = await reportAgent.generateReport(
      templateId,
      { reformCase, documents: documents as Document[], relations, messages },
      { enrichWithAI },
    )

    // 5. Persist the Report record (content stored in DB per CLAUDE.md §Note on storageKey)
    const report = await reportRepo.create({
      caseId,
      tenantId,
      type: reportType,
      content,
    })

    // 6. Upload .md to storage as a secondary artefact
    //    Key is deterministic: no storageKey column needed in Report.
    const storageKey = buildStorageKey(
      tenantId,
      reformCase.condominiumId,
      reformCase.unitId,
      caseId,
      "reports",
      report.id,
      "relatorio.md",
    )

    try {
      await storage.upload(storageKey, Buffer.from(content, "utf8"), "text/markdown")
    } catch (err) {
      // Non-fatal: content is already persisted in the DB.
      logger.warn("report.storage.upload_failed", {
        tenantId,
        caseId,
        reportId: report.id,
        message: (err as Error).message,
      })
    }

    logger.info("report.generate.done", {
      tenantId,
      caseId,
      reportId: report.id,
      reportType,
    })

    return report
  }

  /**
   * Reconstruct the deterministic storage key for an existing report.
   * Used by the /url route to generate a signed URL without needing a storageKey column.
   */
  static buildReportStorageKey(
    tenantId: string,
    condominiumId: string,
    unitId: string,
    caseId: string,
    reportId: string,
  ): string {
    return buildStorageKey(tenantId, condominiumId, unitId, caseId, "reports", reportId, "relatorio.md")
  }

  /** TTL for signed URLs — re-exported for convenience. */
  static readonly SIGNED_URL_TTL = SIGNED_URL_TTL_SECONDS
}
