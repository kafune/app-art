import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser, type SessionUser } from "@/infrastructure/auth/getSessionUser"
import { forbidden, handleError, unauthorized } from "@/interfaces/http/respond"
import { prisma } from "@/infrastructure/database/prisma"
import { SetCondominiumPartnerUseCase } from "@/modules/partner-network/application/SetCondominiumPartnerUseCase"

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"])

const SetPartnerSchema = z.object({
  partnerId: z.string().min(1).nullable(),
})

/**
 * Confirma o acesso ao condomínio: admins acessam qualquer condomínio do
 * tenant; síndico (CONDOMINIUM) apenas o próprio condomínio.
 */
function canManageCondominium(user: SessionUser, condominiumId: string): boolean {
  if (ADMIN_ROLES.has(user.role)) return true
  return user.role === "CONDOMINIUM" && user.condominiumId === condominiumId
}

/** Parceiro técnico fixo do condomínio (ou null). */
export async function GET(_req: NextRequest, ctx: { params: { condominiumId: string } }) {
  try {
    const user = await requireSessionUser()
    if (!canManageCondominium(user, ctx.params.condominiumId)) return forbidden()

    const condominium = await prisma.condominium.findFirst({
      where: { id: ctx.params.condominiumId, tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        partner: {
          select: {
            id: true,
            type: true,
            creaNumber: true,
            specialties: true,
            rating: true,
            slaHours: true,
            active: true,
            user: { select: { name: true } },
          },
        },
      },
    })
    if (!condominium) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

    const p = condominium.partner
    return NextResponse.json({
      partner: p
        ? {
            id: p.id,
            name: p.user.name,
            type: p.type,
            creaNumber: p.creaNumber,
            specialties: p.specialties,
            rating: p.rating == null ? null : Number(p.rating),
            slaHours: p.slaHours,
            active: p.active,
          }
        : null,
    })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}

/** Define ou remove ({ partnerId: null }) o parceiro fixo do condomínio. */
export async function PUT(req: NextRequest, ctx: { params: { condominiumId: string } }) {
  try {
    const user = await requireSessionUser()
    if (!canManageCondominium(user, ctx.params.condominiumId)) return forbidden()

    const body = SetPartnerSchema.parse(await req.json())

    const partner = await new SetCondominiumPartnerUseCase().execute({
      condominiumId: ctx.params.condominiumId,
      partnerId: body.partnerId,
      tenantId: user.tenantId,
      triggeredBy: `user:${user.id}`,
    })

    return NextResponse.json({ partner })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
