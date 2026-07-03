import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"
import { prisma } from "@/infrastructure/database/prisma"

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"])
const forbidden = () => NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
const notFound = () => NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

const UpdateUnitSchema = z.object({
  identifier: z.string().min(1).max(40).optional(),
  block: z.string().max(60).nullable().optional(),
  floor: z.string().max(20).nullable().optional(),
  ownerName: z.string().max(160).nullable().optional(),
  ownerEmail: z.string().email().nullable().optional().or(z.literal("")),
  ownerPhone: z.string().max(40).nullable().optional(),
})

type Params = { params: { condominiumId: string; unitId: string } }

/**
 * Busca a unidade garantindo o acesso do usuário ao condomínio.
 * SUPER_ADMIN acessa qualquer condomínio; demais papéis só os do próprio tenant.
 */
async function findUnit(
  condominiumId: string,
  unitId: string,
  user: { role: string; tenantId: string },
) {
  return prisma.unit.findFirst({
    where: {
      id: unitId,
      condominiumId,
      ...(user.role === "SUPER_ADMIN" ? {} : { condominium: { tenantId: user.tenantId } }),
    },
    include: { _count: { select: { cases: true } } },
  })
}

export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const user = await requireSessionUser()
    if (!ADMIN_ROLES.has(user.role)) return forbidden()

    const existing = await findUnit(ctx.params.condominiumId, ctx.params.unitId, user)
    if (!existing) return notFound()

    const body = UpdateUnitSchema.parse(await req.json())

    const updated = await prisma.unit.update({
      where: { id: existing.id },
      data: {
        identifier: body.identifier?.trim(),
        block: body.block === undefined ? undefined : body.block?.trim() || null,
        floor: body.floor === undefined ? undefined : body.floor?.trim() || null,
        ownerName: body.ownerName === undefined ? undefined : body.ownerName?.trim() || null,
        ownerEmail:
          body.ownerEmail === undefined ? undefined : body.ownerEmail?.trim().toLowerCase() || null,
        ownerPhone: body.ownerPhone === undefined ? undefined : body.ownerPhone?.trim() || null,
      },
      include: { _count: { select: { cases: true } } },
    })

    return NextResponse.json({
      unit: {
        id: updated.id,
        identifier: updated.identifier,
        block: updated.block,
        floor: updated.floor,
        ownerName: updated.ownerName,
        ownerEmail: updated.ownerEmail,
        ownerPhone: updated.ownerPhone,
        caseCount: updated._count.cases,
      },
    })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}

/** Exclui a unidade — permitido apenas quando não há casos vinculados. */
export async function DELETE(_req: NextRequest, ctx: Params) {
  try {
    const user = await requireSessionUser()
    if (!ADMIN_ROLES.has(user.role)) return forbidden()

    const existing = await findUnit(ctx.params.condominiumId, ctx.params.unitId, user)
    if (!existing) return notFound()

    if (existing._count.cases > 0) {
      return NextResponse.json(
        { error: "CONFLICT", message: "Não é possível excluir: a unidade possui casos." },
        { status: 409 },
      )
    }

    await prisma.unit.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
