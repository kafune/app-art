import type { TemplateId } from "@reformai/templates"
import type { ReformCase, Document } from "@reformai/database"

/**
 * Nomes e dados relacionados ao caso, resolvidos a partir das chaves do
 * ReformCase. Quando ausentes, os builders caem para os IDs crus.
 */
export interface CaseRelations {
  condominiumName?: string
  unitLabel?: string
  clientName?: string
  partner?: { name: string; creaNumber: string } | null
  plan?: { name: string; basePrice: string; extraInspectionPrice: string } | null
  sindicoContact?: { name: string; email: string } | null
}

/** Mensagem da conversa de triagem, usada no anexo do relatório de análise. */
export interface CaseMessage {
  role: string
  content: string
  createdAt: Date
}

/**
 * Rich data snapshot of a reform case used for report generation.
 * Assembled by GenerateReportUseCase from the case + its documents.
 */
export interface ReformCaseData {
  /** The full ReformCase record from the database. */
  reformCase: ReformCase
  /** All documents attached to the case (extracted data included). */
  documents: Document[]
  /** Nomes/relações resolvidos (condomínio, unidade, proprietário, etc.). */
  relations?: CaseRelations
  /** Conversa de triagem do caso (quando o relatório a consolida). */
  messages?: CaseMessage[]
}

/**
 * Result of a report generation operation.
 */
export interface ReportGenerationResult {
  /** Markdown content of the report (already includes the mandatory disclaimer). */
  content: string
  /** Which template was used to render this report. */
  templateUsed: TemplateId
}

/**
 * Domain interface for the report generation agent.
 *
 * Implementations live in the application layer. The domain never imports SDKs.
 */
export interface ReportAgent {
  generateReport(
    templateId: TemplateId,
    caseData: ReformCaseData,
    options?: { enrichWithAI?: boolean },
  ): Promise<ReportGenerationResult>
}
