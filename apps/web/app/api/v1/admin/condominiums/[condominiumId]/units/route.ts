import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"
import { prisma } from "@/infrastructure/database/prisma"

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"])
const forbidden = () => NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
const notFound = () => NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

const CreateUnitSchema = z.object({
  identifier: z.string().min(1).max(40),
  block: z.string().max(60).optional(),
  floor: z.string().max(20).optional(),
  ownerName: z.string().max(160).optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerPhone: z.string().max(40).optional(),
})

/**
 * Confirma que o condomínio existe e é acessível ao usuário.
 * SUPER_ADMIN acessa qualquer condomínio; demais papéis só os do próprio tenant.
 */
async function assertCondominium(condominiumId: string, user: { role: string; tenantId: string }) {
  const where =
    user.role === "SUPER_ADMIN"
      ? { id: condominiumId }
      : { id: condominiumId, tenantId: user.tenantId }
  return prisma.condominium.findFirst({ where })
}

/** Lista as unidades de um condomínio, com contagem de casos. */
export async function GET(_req: NextRequest, ctx: { params: { condominiumId: string } }) {
  try {
    const user = await requireSessionUser()
    if (!ADMIN_ROLES.has(user.role)) return forbidden()

    const condominium = await assertCondominium(ctx.params.condominiumId, user)
    if (!condominium) return notFound()

    const units = await prisma.unit.findMany({
      where: { condominiumId: condominium.id },
      orderBy: { identifier: "asc" },
      include: { _count: { select: { cases: true } } },
    })

    return NextResponse.json({
      units: units.map((u) => ({
        id: u.id,
        identifier: u.identifier,
        block: u.block,
        floor: u.floor,
        ownerName: u.ownerName,
        ownerEmail: u.ownerEmail,
        ownerPhone: u.ownerPhone,
        caseCount: u._count.cases,
      })),
    })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}

/** Cria uma unidade no condomínio. */
export async function POST(req: NextRequest, ctx: { params: { condominiumId: string } }) {
  try {
    const user = await requireSessionUser()
    if (!ADMIN_ROLES.has(user.role)) return forbidden()

    const condominium = await assertCondominium(ctx.params.condominiumId, user)
    if (!condominium) return notFound()

    const body = CreateUnitSchema.parse(await req.json())

    const unit = await prisma.unit.create({
      data: {
        condominiumId: condominium.id,
        identifier: body.identifier.trim(),
        block: body.block?.trim() || null,
        floor: body.floor?.trim() || null,
        ownerName: body.ownerName?.trim() || null,
        ownerEmail: body.ownerEmail?.trim().toLowerCase() || null,
        ownerPhone: body.ownerPhone?.trim() || null,
      },
    })

    return NextResponse.json(
      {
        unit: {
          id: unit.id,
          identifier: unit.identifier,
          block: unit.block,
          floor: unit.floor,
          ownerName: unit.ownerName,
          ownerEmail: unit.ownerEmail,
          ownerPhone: unit.ownerPhone,
          caseCount: 0,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
