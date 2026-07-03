import { NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"
import { ValidationError } from "@/shared/errors/DomainError"
import { prisma } from "@/infrastructure/database/prisma"

const ALLOWED_ROLES = ["ADMIN", "SUPER_ADMIN", "CONDOMINIUM", "MANAGER"]

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser()

    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new ValidationError("Acesso negado: role insuficiente para listar parceiros")
    }

    const { searchParams } = req.nextUrl
    const city = searchParams.get("city") ?? undefined
    const state = searchParams.get("state") ?? undefined
    const specialty = searchParams.get("specialty") ?? undefined

    const whereClause: Record<string, unknown> = {
      tenantId: user.tenantId,
      active: true,
    }
    if (state) whereClause["states"] = { has: state }
    if (city) whereClause["cities"] = { hasSome: [city, "*"] }
    if (specialty) whereClause["specialties"] = { has: specialty }

    const partners = await prisma.partner.findMany({
      where: whereClause,
      include: { user: { select: { name: true } } },
    })

    // Return only non-sensitive fields — omit userId and basePrice
    const safe = partners.map((p) => ({
      id: p.id,
      name: p.user.name,
      type: p.type,
      creaNumber: p.creaNumber,
      specialties: p.specialties,
      cities: p.cities,
      states: p.states,
      rating: p.rating,
      slaHours: p.slaHours,
      active: p.active,
    }))

    return NextResponse.json({ partners: safe })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
