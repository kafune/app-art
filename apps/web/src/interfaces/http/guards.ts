import { prisma } from "@/infrastructure/database/prisma"
import { ForbiddenError, NotFoundError } from "@/shared/errors/DomainError"
import type { SessionUser } from "@/infrastructure/auth/getSessionUser"

/** Lança ForbiddenError se o papel do usuário não estiver na lista permitida. */
export function requireRole(user: SessionUser, roles: readonly string[]): void {
  if (!roles.includes(user.role)) throw new ForbiddenError()
}

export interface CaseAccess {
  id: string
  tenantId: string
  clientId: string
  condominiumId: string
  unitId: string
  partnerId: string | null
}

/**
 * Garante que o usuário pode acessar o caso, combinando isolamento por tenant
 * com posse por papel:
 *  - ADMIN/SUPER_ADMIN/MANAGER: qualquer caso do próprio tenant
 *  - CONDOMINIUM: apenas casos do seu condomínio
 *  - CLIENT: apenas os próprios casos
 *  - PARTNER: apenas casos atribuídos ao seu Partner; com
 *    `allowPreferredPartnerRead`, também casos de condomínios onde ele é o
 *    parceiro técnico fixo (somente rotas de leitura devem passar essa flag)
 * Caso fora do tenant é tratado como inexistente (404), não 403, para não
 * vazar a existência de recursos de outros tenants.
 */
export async function assertCaseAccess(
  user: SessionUser,
  caseId: string,
  opts?: { allowPreferredPartnerRead?: boolean },
): Promise<CaseAccess> {
  const reformCase = await prisma.reformCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      tenantId: true,
      clientId: true,
      condominiumId: true,
      unitId: true,
      partnerId: true,
    },
  })
  if (!reformCase || reformCase.tenantId !== user.tenantId) {
    throw new NotFoundError("ReformCase", caseId)
  }

  switch (user.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
    case "MANAGER":
      break
    case "CONDOMINIUM":
      if (reformCase.condominiumId !== user.condominiumId) throw new ForbiddenError()
      break
    case "CLIENT":
      if (reformCase.clientId !== user.id) throw new ForbiddenError()
      break
    case "PARTNER": {
      const partner = await prisma.partner.findUnique({
        where: { userId: user.id },
        select: { id: true },
      })
      if (!partner) throw new ForbiddenError()
      if (reformCase.partnerId === partner.id) break
      if (opts?.allowPreferredPartnerRead) {
        const preferred = await prisma.condominium.findFirst({
          where: { id: reformCase.condominiumId, partnerId: partner.id },
          select: { id: true },
        })
        if (preferred) break
      }
      throw new ForbiddenError()
    }
    default:
      throw new ForbiddenError()
  }

  return reformCase
}
