/**
 * CaseNotificationService
 *
 * Envia e-mails automáticos quando o status de um caso muda.
 * Segue o princípio fire-and-forget: qualquer falha no envio é silenciada
 * para não interromper o fluxo principal de negócio.
 *
 * Destinatários por tipo:
 *   CLIENT      → usuário cujo id é clientId do caso
 *   CONDOMINIUM → usuário com role CONDOMINIUM ligado ao condominiumId
 *   ADMIN       → usuários com role ADMIN, MANAGER ou SUPER_ADMIN do tenant
 */

import type { CaseStatus } from "@reformai/database"
import type { EmailProvider } from "@/infrastructure/email/EmailProvider"
import { buildEmailProvider } from "@/infrastructure/email/EmailFactory"
import { prisma } from "@/infrastructure/database/prisma"
import { CASE_STATUS_TEMPLATES, type EmailTarget } from "@/infrastructure/email/caseTemplates"
import { logger } from "@/shared/logger"
import { NotifyUserUseCase } from "@/modules/notifications/application/NotifyUserUseCase"
import { clientTransitionMessage } from "./clientNotificationMessages"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseTransitionParams {
  caseId: string
  protocol: string
  toStatus: CaseStatus
  clientId: string
  tenantId: string
  condominiumId: string
}

interface Recipient {
  email: string
  name: string
  caseUrl: string
  target: EmailTarget
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CaseNotificationService {
  private readonly emailProvider: EmailProvider | null

  constructor(emailProvider?: EmailProvider | null) {
    // Permite injeção em testes; em produção usa EmailFactory
    this.emailProvider = emailProvider !== undefined ? emailProvider : buildEmailProvider()
  }

  /**
   * Dispara os e-mails para a transição de status informada.
   * NUNCA propaga erros — e-mail é non-fatal.
   */
  async onTransition(params: CaseTransitionParams): Promise<void> {
    const { protocol, toStatus, clientId, tenantId, condominiumId, caseId } = params

    // Notificação in-app (+push) ao morador — independente do provedor de
    // e-mail e fire-and-forget. Habilita o sino e o deep-link ao caso.
    this.notifyClientInApp(toStatus, protocol, clientId, tenantId, caseId).catch((err) => {
      logger.warn("case.notification.in_app_failed", {
        caseId,
        toStatus,
        error: (err as Error).message,
      })
    })

    // Sem provedor configurado, nada a fazer (e-mail)
    if (!this.emailProvider) return

    // Sem template para este status, silêncio
    const template = CASE_STATUS_TEMPLATES[toStatus]
    if (!template) return

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const emailProvider = this.emailProvider

    try {
      const recipients = await this.resolveRecipients(
        template.targets,
        clientId,
        tenantId,
        condominiumId,
        toStatus,
        appUrl,
        caseId,
      )

      for (const { email, name, caseUrl, target } of recipients) {
        const override = template.overrides?.[target]
        const subject = (override?.subject ?? template.subject)(protocol)
        const html = (override?.html ?? template.html)({
          protocol,
          caseUrl,
          recipientName: name,
        })

        emailProvider
          .send({ to: email, subject, html })
          .catch((err) => {
            logger.warn("case.notification.email_failed", {
              caseId,
              tenantId,
              toStatus,
              recipientEmail: email,
              error: (err as Error).message,
            })
          })
      }
    } catch (err) {
      // Falha ao resolver destinatários também é silenciada
      logger.warn("case.notification.resolve_recipients_failed", {
        caseId,
        tenantId,
        toStatus,
        error: (err as Error).message,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Cria a notificação in-app (e push) do morador para a transição. O e-mail é
   * desativado aqui (o onTransition já cuida do e-mail templado) para não
   * duplicar a mensagem. Status sem mensagem ao morador são ignorados.
   */
  private async notifyClientInApp(
    toStatus: CaseStatus,
    protocol: string,
    clientId: string,
    tenantId: string,
    caseId: string,
  ): Promise<void> {
    const message = clientTransitionMessage(toStatus, protocol)
    if (!message) return

    // email = null → não envia e-mail aqui; push permanece ativo via factory.
    await new NotifyUserUseCase(undefined, null).execute({
      userId: clientId,
      tenantId,
      caseId,
      title: message.title,
      body: message.body,
    })
  }

  private async resolveRecipients(
    targets: EmailTarget[],
    clientId: string,
    tenantId: string,
    condominiumId: string,
    toStatus: CaseStatus,
    appUrl: string,
    caseId: string,
  ): Promise<Recipient[]> {
    const results: Recipient[] = []

    for (const target of targets) {
      if (target === "CLIENT") {
        const user = await prisma.user.findUnique({
          where: { id: clientId },
          select: { email: true, name: true },
        })
        if (user) {
          // CLIENT acessa via /cases (lista de casos do morador)
          results.push({
            email: user.email,
            name: user.name,
            caseUrl: `${appUrl}/cases`,
            target,
          })
        }
      }

      if (target === "CONDOMINIUM") {
        const syndic = await prisma.user.findFirst({
          where: { condominiumId, tenantId, role: "CONDOMINIUM", active: true },
          select: { email: true, name: true },
        })
        if (syndic) {
          results.push({
            email: syndic.email,
            name: syndic.name,
            caseUrl: `${appUrl}/sindico/cases`,
            target,
          })
        }
      }

      if (target === "ADMIN") {
        const admins = await prisma.user.findMany({
          where: {
            tenantId,
            role: { in: ["ADMIN", "MANAGER", "SUPER_ADMIN"] },
            active: true,
          },
          select: { email: true, name: true },
        })
        for (const admin of admins) {
          results.push({
            email: admin.email,
            name: admin.name,
            // Admins vão para a fila de revisão quando for HUMAN_REVIEW_REQUIRED
            caseUrl:
              toStatus === "HUMAN_REVIEW_REQUIRED"
                ? `${appUrl}/review-queue`
                : `${appUrl}/dashboard`,
            target,
          })
        }
      }

      if (target === "PARTNER") {
        // Prioridade de destinatário:
        //   1. parceiro atribuído ao caso → notifica só ele;
        //   2. parceiro técnico fixo do condomínio → notifica só ele;
        //   3. fallback (ex.: HUMAN_REVIEW_REQUIRED sem parceiro) → todos os
        //      parceiros ativos do tenant, revisores técnicos em potencial.
        const reformCase = await prisma.reformCase.findFirst({
          where: { id: caseId, tenantId },
          select: { partnerId: true, condominium: { select: { partnerId: true } } },
        })
        const targetPartnerId =
          reformCase?.partnerId ?? reformCase?.condominium?.partnerId ?? null
        const partners = await prisma.partner.findMany({
          where: targetPartnerId
            ? { id: targetPartnerId, tenantId, active: true }
            : { tenantId, active: true },
          select: { user: { select: { email: true, name: true, active: true } } },
        })
        const caseUrl =
          toStatus === "HUMAN_REVIEW_REQUIRED"
            ? `${appUrl}/partner/review`
            : `${appUrl}/partner/cases`
        for (const partner of partners) {
          if (!partner.user.active) continue
          results.push({
            email: partner.user.email,
            name: partner.user.name,
            caseUrl,
            target,
          })
        }
      }
    }

    return results
  }
}

// ---------------------------------------------------------------------------
// Singleton factory para uso nos route handlers / use cases
// ---------------------------------------------------------------------------

let _instance: CaseNotificationService | null = null

/**
 * Retorna instância singleton do CaseNotificationService.
 */
export function getCaseNotificationService(): CaseNotificationService {
  if (!_instance) {
    _instance = new CaseNotificationService()
  }
  return _instance
}
