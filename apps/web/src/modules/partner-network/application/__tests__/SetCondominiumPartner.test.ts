import { describe, expect, it, vi, beforeEach } from "vitest"
import { NotFoundError, ValidationError } from "@/shared/errors/DomainError"

const condoFindFirst = vi.fn()
const condoUpdate = vi.fn()
const partnerFindFirst = vi.fn()
const auditCreate = vi.fn()
const txn = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    condominium: { update: (...a: unknown[]) => condoUpdate(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  }),
)

vi.mock("@/infrastructure/database/prisma", () => ({
  prisma: {
    condominium: { findFirst: (...a: unknown[]) => condoFindFirst(...a) },
    partner: { findFirst: (...a: unknown[]) => partnerFindFirst(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => txn(cb),
  },
}))

const notifyExecute = vi.fn(async () => ({}))
vi.mock("@/modules/notifications/application/NotifyUserUseCase", () => ({
  NotifyUserUseCase: class {
    execute = notifyExecute
  },
}))

import { SetCondominiumPartnerUseCase } from "../SetCondominiumPartnerUseCase"

const PARTNER = {
  id: "p1",
  type: "ENGINEER",
  creaNumber: "12345",
  specialties: ["eletrica"],
  rating: null,
  slaHours: 24,
  user: { id: "u-p1", name: "Eng. Silva" },
}

beforeEach(() => {
  vi.clearAllMocks()
  condoFindFirst.mockResolvedValue({ id: "c1", name: "Cond. Central", partnerId: null })
  partnerFindFirst.mockResolvedValue(PARTNER)
  condoUpdate.mockResolvedValue({})
  auditCreate.mockResolvedValue({})
})

const base = {
  condominiumId: "c1",
  partnerId: "p1",
  tenantId: "t1",
  triggeredBy: "user:sindico",
}

describe("SetCondominiumPartnerUseCase", () => {
  it("vincula parceiro ativo ao condomínio, audita e notifica", async () => {
    const r = await new SetCondominiumPartnerUseCase().execute(base)
    expect(r).toMatchObject({ id: "p1", name: "Eng. Silva", creaNumber: "12345" })
    expect(condoUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { partnerId: "p1" },
    })
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "condominium.partner.assigned" }),
      }),
    )
    expect(notifyExecute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-p1", tenantId: "t1" }),
    )
  })

  it("remove o vínculo com partnerId null (sem notificar)", async () => {
    condoFindFirst.mockResolvedValue({ id: "c1", name: "Cond. Central", partnerId: "p1" })
    const r = await new SetCondominiumPartnerUseCase().execute({ ...base, partnerId: null })
    expect(r).toBeNull()
    expect(condoUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { partnerId: null },
    })
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "condominium.partner.removed" }),
      }),
    )
    expect(notifyExecute).not.toHaveBeenCalled()
  })

  it("rejeita parceiro inexistente/inativo/de outro tenant", async () => {
    partnerFindFirst.mockResolvedValue(null)
    await expect(new SetCondominiumPartnerUseCase().execute(base)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(condoUpdate).not.toHaveBeenCalled()
  })

  it("rejeita condomínio fora do tenant", async () => {
    condoFindFirst.mockResolvedValue(null)
    await expect(new SetCondominiumPartnerUseCase().execute(base)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
