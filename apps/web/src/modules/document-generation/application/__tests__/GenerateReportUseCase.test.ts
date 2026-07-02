import { describe, expect, it, vi, beforeEach } from "vitest"
import type { ReformCase, Report } from "@reformai/database"
import { ReportType } from "@reformai/database"
import { NotFoundError } from "@/shared/errors/DomainError"
import type { StorageAdapter } from "@/infrastructure/storage/StorageAdapter"
import type { ReformCaseRepository } from "@/modules/case-intake/domain/repositories/ReformCaseRepository"
import type { DocumentRepository } from "@/modules/document-management/domain/repositories/DocumentRepository"
import type { ReportAgent, ReportGenerationResult } from "../../domain/ReportAgent"
import type { ReportRepository } from "../../infrastructure/PrismaReportRepository"
import { GenerateReportUseCase } from "../GenerateReportUseCase"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DISCLAIMER_MARKER = "caráter meramente informativo"

const FAKE_CASE: ReformCase = {
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
  reformScope: { services: ["Elétrica", "Hidráulica"] },
  evaluationResult: {
    riskLevel: "MEDIUM",
    triageScore: 40,
    triggeredRules: [
      { ruleId: "r1", ruleName: "Elétrica", reason: "Obra elétrica detectada" },
    ],
  },
  partnerId: null,
  commercialPlanId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} as unknown as ReformCase

const FAKE_REPORT: Report = {
  id: "report-1",
  caseId: "case-1",
  tenantId: "tenant-1",
  type: ReportType.ANALYSIS,
  content: "# Relatório\n\nConteúdo...\n\ncaráter meramente informativo",
  skillFileId: null,
  version: 1,
  generatedAt: new Date("2026-01-01T10:00:00Z"),
} as unknown as Report

// ─── Fake factories ───────────────────────────────────────────────────────────

function makeCaseRepo(reformCase: ReformCase | null = FAKE_CASE): ReformCaseRepository {
  return {
    findById: vi.fn().mockResolvedValue(reformCase),
    create: vi.fn(),
    listByTenant: vi.fn(),
    applyScopeClassification: vi.fn(),
    appendMessage: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
  }
}

function makeDocRepo(): DocumentRepository {
  return {
    create: vi.fn().mockResolvedValue({}),
    findById: vi.fn().mockResolvedValue(null),
    findByCaseId: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    updateExtractedData: vi.fn(),
  }
}

function makeStorage(): StorageAdapter {
  return {
    upload: vi.fn<StorageAdapter["upload"]>().mockResolvedValue(undefined),
    getSignedUrl: vi.fn<StorageAdapter["getSignedUrl"]>().mockResolvedValue("https://example.com/signed"),
    delete: vi.fn<StorageAdapter["delete"]>().mockResolvedValue(undefined),
  }
}

function makeReportRepo(report: Report = FAKE_REPORT): ReportRepository {
  return {
    create: vi.fn<ReportRepository["create"]>().mockResolvedValue(report),
    findByCaseId: vi.fn<ReportRepository["findByCaseId"]>().mockResolvedValue([]),
    findById: vi.fn<ReportRepository["findById"]>().mockResolvedValue(report),
  }
}

function makeReportAgent(content: string): ReportAgent {
  return {
    generateReport: vi.fn<ReportAgent["generateReport"]>().mockResolvedValue({
      content,
      templateUsed: "relatorio-analise",
    } satisfies ReportGenerationResult),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GenerateReportUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("cenário (a): geração com enrichWithAI=false (só template)", () => {
    it("chama reportAgent sem enriquecimento e retorna o Report criado", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(mockContent)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      const result = await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.ANALYSIS,
        generatedBy: "user:user-1",
        enrichWithAI: false,
      })

      // Returned the report record
      expect(result).toBe(FAKE_REPORT)

      // Agent was called with correct templateId mapping
      const agentMock = reportAgent.generateReport as ReturnType<typeof vi.fn>
      expect(agentMock).toHaveBeenCalledTimes(1)
      const [templateId, , options] = agentMock.mock.calls[0] as [string, unknown, { enrichWithAI: boolean }]
      expect(templateId).toBe("relatorio-analise")
      expect(options?.enrichWithAI).toBe(false)
    })

    it("faz upload no storage com a chave correta", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(mockContent)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.ANALYSIS,
        generatedBy: "user:user-1",
        enrichWithAI: false,
      })

      const uploadMock = storage.upload as ReturnType<typeof vi.fn>
      expect(uploadMock).toHaveBeenCalledTimes(1)
      const [storageKey, buffer, mime] = uploadMock.mock.calls[0] as [string, Buffer, string]
      expect(storageKey).toMatch(
        /^tenants\/tenant-1\/condominiums\/cond-1\/units\/unit-1\/cases\/case-1\/reports\/report-1\/relatorio\.md$/,
      )
      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(mime).toBe("text/markdown")
    })

    it("persiste o Report no repositório com tenantId, caseId e type corretos", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(mockContent)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.ANALYSIS,
        generatedBy: "user:user-1",
      })

      const createMock = reportRepo.create as ReturnType<typeof vi.fn>
      expect(createMock).toHaveBeenCalledTimes(1)
      const createArg = createMock.mock.calls[0]?.[0] as { caseId: string; tenantId: string; type: string }
      expect(createArg.caseId).toBe("case-1")
      expect(createArg.tenantId).toBe("tenant-1")
      expect(createArg.type).toBe(ReportType.ANALYSIS)
    })

    it("mapeia todos os ReportType para o TemplateId correto", async () => {
      const expectedMappings: Array<[ReportType, string]> = [
        [ReportType.ANALYSIS, "relatorio-analise"],
        [ReportType.INSPECTION_SUMMARY, "relatorio-analise"],
        [ReportType.TECHNICAL_OPINION, "parecer-pendencias"],
        [ReportType.RELEASE_OPINION, "parecer-pendencias"],
        [ReportType.COMMERCIAL_PROPOSAL, "proposta-comercial"],
        [ReportType.SERVICE_ORDER, "ordem-servico"],
        [ReportType.MEMORIAL_DESCRITIVO, "memorial-descritivo"],
        [ReportType.CRONOGRAMA, "cronograma-basico"],
      ]

      for (const [reportType, expectedTemplate] of expectedMappings) {
        const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
        const caseRepo = makeCaseRepo()
        const docRepo = makeDocRepo()
        const storage = makeStorage()
        const reportRepo = makeReportRepo()
        const reportAgent = makeReportAgent(mockContent)

        const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

        await useCase.execute({
          caseId: "case-1",
          tenantId: "tenant-1",
          reportType,
          generatedBy: "user:user-1",
        })

        const agentMock = reportAgent.generateReport as ReturnType<typeof vi.fn>
        const [templateId] = agentMock.mock.calls[0] as [string]
        expect(templateId, `ReportType.${reportType} should map to ${expectedTemplate}`).toBe(
          expectedTemplate,
        )
      }
    })
  })

  describe("cenário (b): geração com enrichWithAI=true", () => {
    it("chama reportAgent com enrichWithAI=true", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(mockContent)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.TECHNICAL_OPINION,
        generatedBy: "user:user-1",
        enrichWithAI: true,
      })

      const agentMock = reportAgent.generateReport as ReturnType<typeof vi.fn>
      expect(agentMock).toHaveBeenCalledTimes(1)
      const [templateId, , options] = agentMock.mock.calls[0] as [string, unknown, { enrichWithAI?: boolean }]
      expect(templateId).toBe("parecer-pendencias")
      expect(options?.enrichWithAI).toBe(true)
    })
  })

  describe("cenário (b2): conversa de triagem no relatório de análise", () => {
    it("carrega as mensagens e as repassa ao agente para ANALYSIS", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()
      const messages = [
        { id: "m1", role: "USER", content: "Quero trocar o piso", createdAt: new Date() },
      ]
      ;(caseRepo.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue(messages)
      const reportAgent = makeReportAgent(mockContent)

      const useCase = new GenerateReportUseCase({
        caseRepo,
        docRepo: makeDocRepo(),
        reportRepo: makeReportRepo(),
        storage: makeStorage(),
        reportAgent,
      })

      await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.ANALYSIS,
        generatedBy: "user:user-1",
      })

      expect(caseRepo.listMessages).toHaveBeenCalledWith("case-1", "tenant-1")
      const agentMock = reportAgent.generateReport as ReturnType<typeof vi.fn>
      const [, caseData] = agentMock.mock.calls[0] as [string, { messages?: unknown[] }]
      expect(caseData.messages).toEqual(messages)
    })

    it("não carrega mensagens para relatórios que não usam o template de análise", async () => {
      const mockContent = `# Relatório\n\n${DISCLAIMER_MARKER}\n`
      const caseRepo = makeCaseRepo()

      const useCase = new GenerateReportUseCase({
        caseRepo,
        docRepo: makeDocRepo(),
        reportRepo: makeReportRepo(),
        storage: makeStorage(),
        reportAgent: makeReportAgent(mockContent),
      })

      await useCase.execute({
        caseId: "case-1",
        tenantId: "tenant-1",
        reportType: ReportType.COMMERCIAL_PROPOSAL,
        generatedBy: "user:user-1",
      })

      expect(caseRepo.listMessages).not.toHaveBeenCalled()
    })
  })

  describe("cenário (c): erro quando caso não existe", () => {
    it("lança NotFoundError quando o caso não é encontrado", async () => {
      const caseRepo = makeCaseRepo(null)
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(`# ${DISCLAIMER_MARKER}`)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      await expect(
        useCase.execute({
          caseId: "nonexistent-case",
          tenantId: "tenant-1",
          reportType: ReportType.ANALYSIS,
          generatedBy: "user:user-1",
        }),
      ).rejects.toBeInstanceOf(NotFoundError)

      // Agent and storage must not be called
      const agentMock = reportAgent.generateReport as ReturnType<typeof vi.fn>
      expect(agentMock).not.toHaveBeenCalled()
      expect(storage.upload as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
      expect(reportRepo.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
    })

    it("passa o tenantId para findById garantindo isolamento multi-tenant", async () => {
      const caseRepo = makeCaseRepo(null)
      const docRepo = makeDocRepo()
      const storage = makeStorage()
      const reportRepo = makeReportRepo()
      const reportAgent = makeReportAgent(`# ${DISCLAIMER_MARKER}`)

      const useCase = new GenerateReportUseCase({ caseRepo, docRepo, reportRepo, storage, reportAgent })

      await expect(
        useCase.execute({
          caseId: "case-1",
          tenantId: "wrong-tenant",
          reportType: ReportType.ANALYSIS,
          generatedBy: "user:user-1",
        }),
      ).rejects.toBeInstanceOf(NotFoundError)

      const findMock = caseRepo.findById as ReturnType<typeof vi.fn>
      expect(findMock).toHaveBeenCalledWith("case-1", "wrong-tenant")
    })
  })

  describe("buildReportStorageKey (estático)", () => {
    it("constrói a chave determinística corretamente", () => {
      const key = GenerateReportUseCase.buildReportStorageKey(
        "tenant-1",
        "cond-1",
        "unit-1",
        "case-1",
        "report-1",
      )
      expect(key).toBe(
        "tenants/tenant-1/condominiums/cond-1/units/unit-1/cases/case-1/reports/report-1/relatorio.md",
      )
    })
  })
})
