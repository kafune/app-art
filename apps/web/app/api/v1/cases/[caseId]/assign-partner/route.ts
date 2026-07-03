import { NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { forbidden, handleError, unauthorized } from "@/interfaces/http/respond"
import { assertCaseAccess } from "@/interfaces/http/guards"
import { AssignPartnerUseCase } from "@/modules/partner-network/application/AssignPartnerUseCase"
import { PrismaPartnerRepository } from "@/modules/partner-network/infrastructure/PrismaPartnerRepository"

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "CONDOMINIUM"])

/**
 * Atribui o caso a um parceiro técnico: usa o parceiro fixo do condomínio
 * quando definido, senão o matcher (cidade/estado/especialidade).
 * Síndico só atribui casos do próprio condomínio (via assertCaseAccess).
 */
export async function POST(_req: NextRequest, ctx: { params: { caseId: string } }) {
  try {
    const user = await requireSessionUser()
    if (!ALLOWED_ROLES.has(user.role)) return forbidden()

    await assertCaseAccess(user, ctx.params.caseId)

    const result = await new AssignPartnerUseCase(new PrismaPartnerRepository()).execute({
      caseId: ctx.params.caseId,
      tenantId: user.tenantId,
      assignedBy: `user:${user.id}`,
    })

    return NextResponse.json({
      case: { id: result.case.id, status: result.case.status, partnerId: result.case.partnerId },
      partner: { id: result.partner.id },
    })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
