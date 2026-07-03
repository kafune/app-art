import { describe, expect, it, vi, beforeEach } from "vitest"
import { ForbiddenError, NotFoundError } from "@/shared/errors/DomainError"
import type { SessionUser } from "@/infrastructure/auth/getSessionUser"

const findUniqueCase = vi.fn()
const findUniquePartner = vi.fn()
const findFirstTransition = vi.fn()

vi.mock("@/infrastructure/database/prisma", () => ({
  prisma: {
    reformCase: { findUnique: (...a: unknown[]) => findUniqueCase(...a) },
    partner: { findUnique: (...a: unknown[]) => findUniquePartner(...a) },
    caseTransitionLog: { findFirst: (...a: unknown[]) => findFirstTransition(...a) },
  },
}))

import { assertCaseAccess, requireRole } from "../guards"

const CASE = {
  id: "case-1",
  tenantId: "tenant-1",
  clientId: "client-1",
  condominiumId: "cond-1",
  unitId: "unit-1",
  partnerId: "partner-1",
  status: "AWAITING_DOCUMENTS",
}

function user(partial: Partial<SessionUser>): SessionUser {
  return {
    id: "u",
    tenantId: "tenant-1",
    role: "CLIENT",
    email: "u@x.com",
    name: "U",
    condominiumId: null,
    ...partial,
  }
}

beforeEach(() => {
  findUniqueCase.mockReset()
  findUniquePartner.mockReset()
  findFirstTransition.mockReset()
  findUniqueCase.mockResolvedValue(CASE)
  findFirstTransition.mockResolvedValue(null)
})

describe("requireRole", () => {
  it("permite papel na lista", () => {
    expect(() => requireRole(user({ role: "ADMIN" }), ["ADMIN", "SUPER_ADMIN"])).not.toThrow()
  })
  it("bloqueia papel fora da lista", () => {
    expect(() => requireRole(user({ role: "CLIENT" }), ["ADMIN"])).toThrow(ForbiddenError)
  })
})

describe("assertCaseAccess", () => {
  it("404 quando o caso é de outro tenant", async () => {
    findUniqueCase.mockResolvedValue({ ...CASE, tenantId: "outro" })
    await expect(assertCaseAccess(user({ role: "ADMIN" }), "case-1")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("404 quando o caso não existe", async () => {
    findUniqueCase.mockResolvedValue(null)
    await expect(assertCaseAccess(user({ role: "ADMIN" }), "case-1")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("ADMIN acessa qualquer caso do tenant", async () => {
    await expect(assertCaseAccess(user({ role: "ADMIN", id: "x" }), "case-1")).resolves.toMatchObject({ id: "case-1" })
  })

  it("CLIENT acessa só o próprio caso", async () => {
    await expect(assertCaseAccess(user({ role: "CLIENT", id: "client-1" }), "case-1")).resolves.toBeTruthy()
    await expect(assertCaseAccess(user({ role: "CLIENT", id: "outro" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("CONDOMINIUM acessa só casos do seu condomínio", async () => {
    await expect(assertCaseAccess(user({ role: "CONDOMINIUM", condominiumId: "cond-1" }), "case-1")).resolves.toBeTruthy()
    await expect(assertCaseAccess(user({ role: "CONDOMINIUM", condominiumId: "cond-2" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("PARTNER acessa só casos atribuídos ao seu Partner", async () => {
    findUniquePartner.mockResolvedValue({ id: "partner-1", active: true, tenantId: "tenant-1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).resolves.toBeTruthy()

    findUniquePartner.mockResolvedValue({ id: "partner-2", active: true, tenantId: "tenant-1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)

    findUniquePartner.mockResolvedValue(null)
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("PARTNER revisor técnico acessa caso em HUMAN_REVIEW_REQUIRED não atribuído", async () => {
    findUniqueCase.mockResolvedValue({ ...CASE, partnerId: null, status: "HUMAN_REVIEW_REQUIRED" })
    findUniquePartner.mockResolvedValue({ id: "partner-2", active: true, tenantId: "tenant-1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).resolves.toBeTruthy()
  })

  it("PARTNER inativo não acessa a fila de revisão", async () => {
    findUniqueCase.mockResolvedValue({ ...CASE, partnerId: null, status: "HUMAN_REVIEW_REQUIRED" })
    findUniquePartner.mockResolvedValue({ id: "partner-2", active: false, tenantId: "tenant-1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("PARTNER não acessa caso não atribuído fora de revisão humana", async () => {
    findUniqueCase.mockResolvedValue({ ...CASE, partnerId: null, status: "AWAITING_DOCUMENTS" })
    findUniquePartner.mockResolvedValue({ id: "partner-2", active: true, tenantId: "tenant-1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("PARTNER que já emitiu parecer mantém acesso de consulta após a transição", async () => {
    findUniqueCase.mockResolvedValue({ ...CASE, partnerId: null, status: "PENDING_CORRECTIONS" })
    findUniquePartner.mockResolvedValue({ id: "partner-2", active: true, tenantId: "tenant-1" })
    findFirstTransition.mockResolvedValue({ id: "t1" })
    await expect(assertCaseAccess(user({ role: "PARTNER", id: "pu" }), "case-1")).resolves.toBeTruthy()
    expect(findFirstTransition).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ triggeredBy: "reviewer:pu" }) }),
    )
  })
})
