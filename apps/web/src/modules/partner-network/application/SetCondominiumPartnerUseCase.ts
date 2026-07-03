import { prisma } from "@/infrastructure/database/prisma"
import { NotFoundError, ValidationError } from "@/shared/errors/DomainError"
import { NotifyUserUseCase } from "@/modules/notifications/application/NotifyUserUseCase"
import { logger } from "@/shared/logger"

export interface SetCondominiumPartnerInput {
  condominiumId: string
  partnerId: string | null // null remove o vínculo
  tenantId: string
  triggeredBy: string // "user:{id}"
}

export interface CondominiumPartnerView {
  id: string
  name: string
  type: string
  creaNumber: string
  specialties: string[]
  rating: number | null
  slaHours: number | null
}

/**
 * Define (ou remove) o parceiro técnico fixo de um condomínio.
 * Todo caso do condomínio passa a ser visível para esse parceiro, e a
 * atribuição de casos (AssignPartnerUseCase) o prioriza sobre o matcher.
 */
export class SetCondominiumPartnerUseCase {
  async execute(input: SetCondominiumPartnerInput): Promise<CondominiumPartnerView | null> {
    const { condominiumId, partnerId, tenantId, triggeredBy } = input

    const condominium = await prisma.condominium.findFirst({
      where: { id: condominiumId, tenantId },
      select: { id: true, name: true, partnerId: true },
    })
    if (!condominium) throw new NotFoundError("Condominium", condominiumId)

    let partner: {
      id: string
      type: string
      creaNumber: string
      specialties: string[]
      rating: { toString(): string } | null
      slaHours: number | null
      user: { id: string; name: string }
    } | null = null

    if (partnerId) {
      partner = await prisma.partner.findFirst({
        where: { id: partnerId, tenantId, active: true },
        select: {
          id: true,
          type: true,
          creaNumber: true,
          specialties: true,
          rating: true,
          slaHours: true,
          user: { select: { id: true, name: true } },
        },
      })
      if (!partner) {
        throw new ValidationError("Parceiro não encontrado ou inativo neste tenant.")
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.condominium.update({
        where: { id: condominium.id },
        data: { partnerId: partner?.id ?? null },
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          action: partner ? "condominium.partner.assigned" : "condominium.partner.removed",
          triggeredBy,
          details: {
            condominiumId: condominium.id,
            condominiumName: condominium.name,
            partnerId: partner?.id ?? null,
            previousPartnerId: condominium.partnerId,
          },
        },
      })
    })

    // Notifica o parceiro que passou a responder pelo condomínio — non-fatal.
    if (partner) {
      new NotifyUserUseCase()
        .execute({
          userId: partner.user.id,
          tenantId,
          title: "Você é o parceiro técnico de um condomínio",
          body: `O condomínio ${condominium.name} definiu você como parceiro técnico fixo. Os casos de reforma dele aparecem no seu painel.`,
        })
        .catch((err) =>
          logger.warn("condominium.partner.notify_failed", {
            partnerId: partner?.id,
            message: err instanceof Error ? err.message : "erro desconhecido",
          }),
        )
    }

    logger.info(partner ? "condominium.partner.assigned" : "condominium.partner.removed", {
      tenantId,
      condominiumId: condominium.id,
      partnerId: partner?.id ?? null,
    })

    if (!partner) return null
    return {
      id: partner.id,
      name: partner.user.name,
      type: partner.type,
      creaNumber: partner.creaNumber,
      specialties: partner.specialties,
      rating: partner.rating == null ? null : Number(partner.rating.toString()),
      slaHours: partner.slaHours,
    }
  }
}
