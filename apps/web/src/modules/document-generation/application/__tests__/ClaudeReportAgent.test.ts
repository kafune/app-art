import { describe, expect, it, vi } from "vitest"
import type { ReformCase, Document } from "@reformai/database"
import type { LLMProvider } from "@/modules/document-intelligence/domain/LLMProvider"
import { ClaudeReportAgent } from "../ClaudeReportAgent"
import type { CaseRelations } from "../../domain/ReportAgent"

function makeLLM(): LLMProvider {
  return {
    complete: vi.fn(),
    stream: vi.fn(),
    completeWithTools: vi.fn(),
    streamComplete: vi.fn(),
  }
}

const BASE_CASE = {
  id: "case-1",
  protocol: "PROT-001",
  tenantId: "tenant-1",
  condominiumId: "cond-1",
  unitId: "unit-1",
  clientId: "client-1",
  status: "SCOPE_CLASSIFIED",
  riskLevel: "MEDIUM",
  requiresART: true,
  triageScore: 40,
  reformScope: { services: ["Elétrica"], areasAffected: ["Cozinha"], estimatedDurationDays: 10 },
  evaluationResult: { triggeredRules: [] },
  partnerId: null,
  commercialPlanId: null,
} as unknown as ReformCase

const RELATIONS: CaseRelations = {
  condominiumName: "Edifício Aurora",
  unitLabel: "A / 101",
  clientName: "Maria Souza",
  partner: { name: "Eng. João", creaNumber: "CREA-123" },
  plan: null,
  sindicoContact: { name: "Síndico Carlos", email: "c@x.com" },
}

describe("ClaudeReportAgent — relações no conteúdo", () => {
  it("usa nomes resolvidos em vez de IDs quando há relations", async () => {
    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "relatorio-analise",
      { reformCase: BASE_CASE, documents: [], relations: RELATIONS },
      { enrichWithAI: false },
    )
    expect(content).toContain("Edifício Aurora")
    expect(content).toContain("A / 101")
    expect(content).not.toContain("cond-1")
  })

  it("usa o nome do proprietário no memorial descritivo", async () => {
    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "memorial-descritivo",
      { reformCase: BASE_CASE, documents: [], relations: RELATIONS },
      { enrichWithAI: false },
    )
    expect(content).toContain("Maria Souza")
    expect(content).toContain("Eng. João")
  })

  it("cai para IDs crus quando relations está ausente", async () => {
    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "relatorio-analise",
      { reformCase: BASE_CASE, documents: [] },
      { enrichWithAI: false },
    )
    expect(content).toContain("cond-1")
  })

  it("consolida análise documental e conversa no relatório de análise", async () => {
    const docs = [
      {
        type: "ART_RRT",
        fileName: "art.pdf",
        status: "VALID_WITH_CAVEATS",
        extractedData: { numero_art: "ART-987", responsavel: "Eng. João" },
        pendencies: {
          items: ["Falta assinatura do responsável"],
          inconsistencies: [
            { description: "CREA divergente do cadastro", severity: "medium" },
          ],
          recommendation: "approve_with_caveats",
          reasoning: "Documento coerente com o escopo, com ressalvas.",
        },
      },
    ] as unknown as Document[]

    const messages = [
      { role: "SYSTEM", content: "prompt interno", createdAt: new Date("2026-01-01T09:00:00Z") },
      { role: "USER", content: "Quero trocar o piso da sala", createdAt: new Date("2026-01-01T10:00:00Z") },
      { role: "ASSISTANT", content: "Entendido, será com demolição?", createdAt: new Date("2026-01-01T10:01:00Z") },
    ]

    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "relatorio-analise",
      { reformCase: BASE_CASE, documents: docs, relations: RELATIONS, messages },
      { enrichWithAI: false },
    )

    // Análise documental
    expect(content).toContain("ART/RRT (art.pdf)")
    expect(content).toContain("Válido com ressalvas")
    expect(content).toContain("numero_art: ART-987")
    expect(content).toContain("CREA divergente do cadastro")
    expect(content).toContain("Falta assinatura do responsável")
    expect(content).toContain("Aprovar com ressalvas")

    // Conversa de triagem (SYSTEM omitido)
    expect(content).toContain("Quero trocar o piso da sala")
    expect(content).toContain("**Morador**")
    expect(content).toContain("**Assistente**")
    expect(content).not.toContain("prompt interno")
  })

  it("usa fallbacks quando não há documentos nem conversa", async () => {
    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "relatorio-analise",
      { reformCase: BASE_CASE, documents: [], relations: RELATIONS },
      { enrichWithAI: false },
    )
    expect(content).toContain("(nenhum documento enviado até a data deste relatório)")
    expect(content).toContain("(nenhuma interação registrada na triagem)")
  })

  it("preenche documentos válidos/pendentes no parecer", async () => {
    const docs = [
      { type: "ART_RRT", fileName: "art.pdf", status: "VALID", pendencies: null },
      { type: "MEMORIAL", fileName: "mem.pdf", status: "PENDING", pendencies: null },
    ] as unknown as Document[]

    const agent = new ClaudeReportAgent(makeLLM())
    const { content } = await agent.generateReport(
      "parecer-pendencias",
      { reformCase: BASE_CASE, documents: docs, relations: RELATIONS },
      { enrichWithAI: false },
    )
    expect(content).toContain("art.pdf")
    expect(content).toContain("mem.pdf")
  })
})
