import { describe, expect, it, vi, beforeEach } from "vitest"
import { NotFoundError } from "@/shared/errors/DomainError"

const caseFindFirst = vi.fn()
const condoFindFirst = vi.fn()
const caseUpdate = vi.fn()
const transitionCreate = vi.fn()
const auditCreate = vi.fn()
const txn = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    reformCase: { update: (...a: unknown[]) => caseUpdate(...a) },
    caseTransitionLog: { create: (...a: unknown[]) => transitionCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  }),
)

vi.mock("@/infrastructure/database/prisma", () => ({
  prisma: {
    reformCase: { findFirst: (...a: unknown[]) => caseFindFirst(...a) },
    condominium: { findFirst: (...a: unknown[]) => condoFindFirst(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => txn(cb),
  },
}))

vi.mock("@/modules/case-intake/application/CaseNotificationService", () => ({
  getCaseNotificationService: () => ({ onTransition: vi.fn(async () => {}) }),
}))

import { AssignPartnerUseCase } from "../AssignPartnerUseCase"

const FIXED_PARTNER = { id: "p-fixed", active: true, type: "ENGINEER", rating: null, slaHours: 24 }
const MATCHED_PARTNER = {
  id: "p-matched",
  active: true,
  type: "ENGINEER",
  specialties: ["eletrica"],
  cities: ["*"],
  states: ["SP"],
  rating: null,
  slaHours: 24,
}

const BASE_CASE = {
  id: "case1",
  tenantId: "t1",
  protocol: "RF-1",
  status: "ELIGIBLE_FOR_RELEASE",
  riskLevel: "LOW",
  condominiumId: "c1",
  clientId: "client1",
  reformScope: { services: ["pintura"] },
}

const repo = { findAvailable: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  caseFindFirst.mockResolvedValue(BASE_CASE)
  caseUpdate.mockResolvedValue({ ...BASE_CASE, status: "ASSIGNED_TO_PARTNER" })
  transitionCreate.mockResolvedValue({})
  auditCreate.mockResolvedValue({})
  repo.findAvailable.mockResolvedValue([MATCHED_PARTNER])
})

const input = { caseId: "case1", tenantId: "t1", assignedBy: "user:sindico" }

describe("AssignPartnerUseCase", () => {
  it("prioriza o parceiro fixo do condomínio sem consultar o matcher", async () => {
    condoFindFirst.mockResolvedValue({ city: "SP", state: "SP", partner: FIXED_PARTNER })
    const r = await new AssignPartnerUseCase(repo).execute(input)
    expect(r.partner.id).toBe("p-fixed")
    expect(repo.findAvailable).not.toHaveBeenCalled()
    expect(caseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { partnerId: "p-fixed", status: "ASSIGNED_TO_PARTNER" },
      }),
    )
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { partnerId: "p-fixed", selectionReason: "parceiro fixo do condomínio" },
        }),
      }),
    )
  })

  it("usa o matcher quando não há parceiro fixo", async () => {
    condoFindFirst.mockResolvedValue({ city: "SP", state: "SP", partner: null })
    const r = await new AssignPartnerUseCase(repo).execute(input)
    expect(r.partner.id).toBe("p-matched")
    expect(repo.findAvailable).toHaveBeenCalledWith("t1", "SP", "SP")
  })

  it("ignora parceiro fixo inativo e cai no matcher", async () => {
    condoFindFirst.mockResolvedValue({
      city: "SP",
      state: "SP",
      partner: { ...FIXED_PARTNER, active: false },
    })
    const r = await new AssignPartnerUseCase(repo).execute(input)
    expect(r.partner.id).toBe("p-matched")
  })

  it("lança NotFound quando não há parceiro fixo nem match", async () => {
    condoFindFirst.mockResolvedValue({ city: "SP", state: "SP", partner: null })
    repo.findAvailable.mockResolvedValue([])
    await expect(new AssignPartnerUseCase(repo).execute(input)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it("rejeita status inválido para atribuição", async () => {
    caseFindFirst.mockResolvedValue({ ...BASE_CASE, status: "DRAFT" })
    await expect(new AssignPartnerUseCase(repo).execute(input)).rejects.toThrow(
      /Caso deve estar em um dos estados/,
    )
  })
})
