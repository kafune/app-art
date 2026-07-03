import { describe, expect, it, vi, beforeEach } from "vitest"
import { ValidationError, NotFoundError } from "@/shared/errors/DomainError"

const condoFindUnique = vi.fn()
const userFindUnique = vi.fn()
const userCreate = vi.fn()
const unitFindFirst = vi.fn()
const unitCreate = vi.fn()
const unitUpdate = vi.fn()
const txn = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
    unit: {
      findFirst: (...a: unknown[]) => unitFindFirst(...a),
      create: (...a: unknown[]) => unitCreate(...a),
      update: (...a: unknown[]) => unitUpdate(...a),
    },
  }),
)

vi.mock("@/infrastructure/database/prisma", () => ({
  prisma: {
    condominium: { findUnique: (...a: unknown[]) => condoFindUnique(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => txn(cb),
  },
}))

vi.mock("@/infrastructure/auth/password", () => ({
  hashPassword: vi.fn(async () => "scrypt$salt$hash"),
}))

import { RegisterClientUseCase } from "../RegisterClientUseCase"

beforeEach(() => {
  vi.clearAllMocks()
  condoFindUnique.mockResolvedValue({
    id: "c1",
    tenantId: "t1",
    active: true,
    tenant: { active: true },
  })
  userFindUnique.mockResolvedValue(null)
  unitFindFirst.mockResolvedValue(null)
  unitCreate.mockResolvedValue({ id: "un1" })
  unitUpdate.mockResolvedValue({ id: "un1" })
  userCreate.mockResolvedValue({
    id: "u1",
    name: "Morador",
    email: "morador@x.com",
    role: "CLIENT",
  })
})

const base = {
  name: "Morador",
  email: "Morador@x.com",
  password: "senha123",
  condominiumId: "c1",
  block: "A",
  unitIdentifier: "101",
}

describe("RegisterClientUseCase", () => {
  it("cria unidade nova com o morador como contato quando ela não existe", async () => {
    const r = await new RegisterClientUseCase().execute(base)
    expect(r).toMatchObject({ id: "u1", condominiumId: "c1", tenantId: "t1", unitLabel: "A / 101" })
    expect(unitCreate).toHaveBeenCalledWith({
      data: {
        condominiumId: "c1",
        identifier: "101",
        block: "A",
        ownerName: "Morador",
        ownerEmail: "morador@x.com",
      },
    })
    expect(unitUpdate).not.toHaveBeenCalled()
  })

  it("reivindica unidade pré-cadastrada sem morador vinculado", async () => {
    unitFindFirst.mockResolvedValue({
      id: "un1",
      block: "A",
      identifier: "101",
      ownerEmail: null,
      ownerName: null,
    })
    const r = await new RegisterClientUseCase().execute({ ...base, block: "a" })
    expect(unitCreate).not.toHaveBeenCalled()
    expect(unitUpdate).toHaveBeenCalledWith({
      where: { id: "un1" },
      data: { ownerEmail: "morador@x.com", ownerName: "Morador" },
    })
    // Label usa o formato canônico do banco, não o digitado pelo morador.
    expect(r.unitLabel).toBe("A / 101")
  })

  it("preserva ownerName existente ao reivindicar unidade", async () => {
    unitFindFirst.mockResolvedValue({
      id: "un1",
      block: "A",
      identifier: "101",
      ownerEmail: null,
      ownerName: "Proprietário",
    })
    await new RegisterClientUseCase().execute(base)
    expect(unitUpdate).toHaveBeenCalledWith({
      where: { id: "un1" },
      data: { ownerEmail: "morador@x.com", ownerName: "Proprietário" },
    })
  })

  it("aceita unidade já vinculada ao próprio e-mail (case-insensitive)", async () => {
    unitFindFirst.mockResolvedValue({
      id: "un1",
      block: "A",
      identifier: "101",
      ownerEmail: "MORADOR@x.com",
      ownerName: "M",
    })
    await new RegisterClientUseCase().execute(base)
    expect(unitCreate).not.toHaveBeenCalled()
    expect(unitUpdate).not.toHaveBeenCalled()
    expect(userCreate).toHaveBeenCalled()
  })

  it("rejeita unidade vinculada a outro morador", async () => {
    unitFindFirst.mockResolvedValue({ id: "un1", ownerEmail: "outro@x.com", ownerName: "Outro" })
    await expect(new RegisterClientUseCase().execute(base)).rejects.toBeInstanceOf(ValidationError)
    expect(userCreate).not.toHaveBeenCalled()
    expect(unitUpdate).not.toHaveBeenCalled()
  })

  it("rejeita e-mail já cadastrado", async () => {
    userFindUnique.mockResolvedValue({ id: "exists" })
    await expect(new RegisterClientUseCase().execute(base)).rejects.toBeInstanceOf(ValidationError)
    expect(userCreate).not.toHaveBeenCalled()
  })

  it("rejeita condomínio inexistente ou inativo", async () => {
    condoFindUnique.mockResolvedValue(null)
    await expect(new RegisterClientUseCase().execute(base)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("unitLabel sem bloco usa só o identificador", async () => {
    const r = await new RegisterClientUseCase().execute({ ...base, block: undefined })
    expect(r.unitLabel).toBe("101")
    expect(unitFindFirst).toHaveBeenCalledWith({
      where: {
        condominiumId: "c1",
        identifier: { equals: "101", mode: "insensitive" },
        block: null,
      },
    })
  })
})
