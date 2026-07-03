import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CaseStatus, Prisma } from "@reformai/database"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"
import { prisma } from "@/infrastructure/database/prisma"
import { CaseStateMachine } from "@/modules/case-intake/domain/entities/CaseStateMachine"
import { NotFoundError, BusinessRuleViolationError } from "@/shared/errors/DomainError"
import { getCaseNotificationService } from "@/modules/case-intake/application/CaseNotificationService"
import { NotifyUserUseCase } from "@/modules/notifications/application/NotifyUserUseCase"

// PARTNER participa como revisor técnico (engenheiro/arquiteto habilitado) —
// validado adiante contra um registro Partner ativo do próprio usuário.
const REVIEWER_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "PARTNER"])

const BodySchema = z.object({
  decision: z.enum(["approve", "approve_with_conditions", "reject", "request_corrections"]),
  notes: z.string().min(10),
})

const DECISION_STATUS_MAP: Record<string, CaseStatus> = {
  approve: "ELIGIBLE_FOR_RELEASE",
  approve_with_conditions: "RELEASED_WITH_CONDITIONS",
  reject: "ARCHIVED",
  request_corrections: "PENDING_CORRECTIONS",
}

const DECISION_LABEL_PT: Record<string, string> = {
  approve: "Aprovado — liberado para encaminhamento",
  approve_with_conditions: "Aprovado com condições",
  reject: "Rejeitado",
  request_corrections: "Correções solicitadas",
}

export async function POST(req: NextRequest, ctx: { params: { caseId: string } }) {
  try {
    const user = await requireSessionUser()

    if (!REVIEWER_ROLES.has(user.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
    }

    if (user.role === "PARTNER") {
      const partner = await prisma.partner.findUnique({
        where: { userId: user.id },
        select: { active: true, tenantId: true },
      })
      if (!partner || !partner.active || partner.tenantId !== user.tenantId) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
      }
    }

    const body = BodySchema.parse(await req.json())
    const { caseId } = ctx.params

    // Fetch case with tenant isolation
    const reformCase = await prisma.reformCase.findFirst({
      where: { id: caseId, tenantId: user.tenantId },
    })

    if (!reformCase) {
      throw new NotFoundError("ReformCase", caseId)
    }

    if (reformCase.status !== "HUMAN_REVIEW_REQUIRED") {
      throw new BusinessRuleViolationError(
        `Caso deve estar em HUMAN_REVIEW_REQUIRED para revisão humana. Status atual: ${reformCase.status}`,
      )
    }

    const toStatus = DECISION_STATUS_MAP[body.decision]
    if (!toStatus) {
      throw new BusinessRuleViolationError(`Decisão inválida: ${body.decision}`)
    }

    const machine = new CaseStateMachine(reformCase.status, reformCase.riskLevel)
    const triggeredBy = `reviewer:${user.id}`

    machine.transition(toStatus, {
      previousStatus: reformCase.status,
      triggeredBy,
      reason: body.notes,
    })

    const decisionLabel = DECISION_LABEL_PT[body.decision] ?? body.decision

    // Persist everything in a transaction
    const updatedCase = await prisma.$transaction(async (tx) => {
      const updated = await tx.reformCase.update({
        where: { id: caseId },
        data: { status: toStatus, updatedAt: new Date() },
      })

      await tx.caseTransitionLog.create({
        data: {
          caseId,
          fromStatus: reformCase.status,
          toStatus,
          triggeredBy,
          reason: body.notes,
        },
      })

      // O parecer também entra no chat do caso — é onde o morador conversa e
      // espera respostas; sem isto o texto ficava enterrado no histórico.
      await tx.chatMessage.create({
        data: {
          caseId,
          role: "ASSISTANT",
          content: `Parecer técnico — ${decisionLabel}\n\n${body.notes}\n\n— ${user.name}, revisor(a) técnico(a)`,
          metadata: { specialistId: "review", reviewDecision: body.decision, reviewerName: user.name },
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          caseId,
          userId: user.id,
          action: "case.human.review.completed",
          triggeredBy,
          details: { decision: body.decision, notes: body.notes },
          aiReasoning: Prisma.JsonNull,
        },
      })

      return updated
    })

    // Notificação in-app/push ao morador com o TEXTO do parecer (a notificação
    // genérica de transição não carrega a justificativa) — fire-and-forget.
    new NotifyUserUseCase(undefined, null)
      .execute({
        userId: reformCase.clientId,
        tenantId: user.tenantId,
        caseId,
        title: `Parecer técnico — ${reformCase.protocol}`,
        body: `${decisionLabel}: ${body.notes.slice(0, 300)}`,
      })
      .catch(() => {})

    // Notificação por e-mail sobre a decisão de revisão — fire-and-forget
    getCaseNotificationService()
      .onTransition({
        caseId,
        protocol: reformCase.protocol,
        toStatus,
        clientId: reformCase.clientId,
        tenantId: user.tenantId,
        condominiumId: reformCase.condominiumId,
      })
      .catch(() => {})

    return NextResponse.json(updatedCase)
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
