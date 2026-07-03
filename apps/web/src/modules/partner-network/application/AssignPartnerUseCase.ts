import type { Partner, ReformCase } from "@reformai/database"
import { prisma } from "@/infrastructure/database/prisma"
import { CaseStateMachine } from "@/modules/case-intake/domain/entities/CaseStateMachine"
import {
  BusinessRuleViolationError,
  NotFoundError,
} from "@/shared/errors/DomainError"
import { matchPartners } from "../domain/PartnerMatcher"
import type { PartnerRepository } from "../domain/repositories/PartnerRepository"
import { getCaseNotificationService } from "@/modules/case-intake/application/CaseNotificationService"

const VALID_STATUSES = ["AWAITING_PAYMENT", "RELEASED_WITH_CONDITIONS", "ELIGIBLE_FOR_RELEASE"] as const

interface AssignPartnerInput {
  caseId: string
  tenantId: string
  assignedBy: string
}

interface AssignPartnerResult {
  case: ReformCase
  partner: Partner
}

export class AssignPartnerUseCase {
  constructor(private readonly partnerRepo: PartnerRepository) {}

  async execute(input: AssignPartnerInput): Promise<AssignPartnerResult> {
    const { caseId, tenantId, assignedBy } = input

    // (a) Fetch case with tenant isolation
    const reformCase = await prisma.reformCase.findFirst({
      where: { id: caseId, tenantId },
    })
    if (!reformCase) throw new NotFoundError("ReformCase", caseId)

    const currentStatus = reformCase.status as (typeof VALID_STATUSES)[number]
    if (!(VALID_STATUSES as readonly string[]).includes(currentStatus)) {
      throw new BusinessRuleViolationError(
        `Caso deve estar em um dos estados: ${VALID_STATUSES.join(", ")}. Estado atual: ${reformCase.status}`,
      )
    }

    // (b) Fetch condominium city/state + parceiro fixo
    const condominium = await prisma.condominium.findFirst({
      where: { id: reformCase.condominiumId, tenantId },
      select: { city: true, state: true, partner: true },
    })
    if (!condominium) throw new NotFoundError("Condominium", reformCase.condominiumId)

    // (c) Parceiro fixo do condomínio tem prioridade sobre o matcher.
    let selected: Partner
    let selectionReason: string

    if (condominium.partner && condominium.partner.active) {
      selected = condominium.partner
      selectionReason = "parceiro fixo do condomínio"
    } else {
      // (d) Extract services from reformScope JSON
      const scope = reformCase.reformScope as Record<string, unknown> | null
      const servicesNeeded: string[] = Array.isArray(scope?.services)
        ? (scope.services as string[])
        : []

      // (e) Find and rank available partners
      const availablePartners = await this.partnerRepo.findAvailable(
        tenantId,
        condominium.city,
        condominium.state,
      )

      const ranked = matchPartners(availablePartners, {
        city: condominium.city,
        state: condominium.state,
        servicesNeeded,
        riskLevel: (reformCase.riskLevel ?? "LOW") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      })

      // No match → error
      if (ranked.length === 0) {
        throw new NotFoundError("Partner", "no-match")
      }

      selected = ranked[0]!
      selectionReason = "matcher (cidade/estado/especialidade)"
    }

    // Validate transition
    const machine = new CaseStateMachine(reformCase.status, reformCase.riskLevel)
    machine.transition("ASSIGNED_TO_PARTNER", {
      previousStatus: reformCase.status,
      triggeredBy: assignedBy,
      reason: `Parceiro ${selected.id} atribuído (${selectionReason})`,
    })

    // (f) Transaction: update case, create logs
    const updatedCase = await prisma.$transaction(async (tx) => {
      const updated = await tx.reformCase.update({
        where: { id: caseId },
        data: {
          partnerId: selected.id,
          status: "ASSIGNED_TO_PARTNER",
        },
      })

      await tx.caseTransitionLog.create({
        data: {
          caseId,
          fromStatus: reformCase.status,
          toStatus: "ASSIGNED_TO_PARTNER",
          triggeredBy: assignedBy,
          reason: `Parceiro ${selected.id} atribuído (${selectionReason})`,
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          caseId,
          action: "partner.assigned",
          triggeredBy: assignedBy,
          details: { partnerId: selected.id, selectionReason },
        },
      })

      return updated
    })

    // Notificação por e-mail — fire-and-forget
    getCaseNotificationService()
      .onTransition({
        caseId,
        protocol: reformCase.protocol,
        toStatus: "ASSIGNED_TO_PARTNER",
        clientId: reformCase.clientId,
        tenantId,
        condominiumId: reformCase.condominiumId,
      })
      .catch(() => {})

    return { case: updatedCase as ReformCase, partner: selected }
  }
}
