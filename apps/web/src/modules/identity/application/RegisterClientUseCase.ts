import { prisma } from "@/infrastructure/database/prisma"
import { hashPassword } from "@/infrastructure/auth/password"
import { NotFoundError, ValidationError } from "@/shared/errors/DomainError"
import { logger } from "@/shared/logger"

export interface RegisterClientInput {
  name: string
  email: string
  password: string
  condominiumId: string
  block?: string
  unitIdentifier: string
}

export interface RegisteredClient {
  id: string
  name: string
  email: string
  role: string
  tenantId: string
  condominiumId: string
  unitLabel: string
}

/**
 * Autocadastro de morador (role CLIENT) a partir do link/QR do condomínio.
 * Regras: condomínio e tenant ativos, e-mail único. O `tenantId` é derivado
 * do condomínio. A unidade é localizada por torre/bloco + identificador:
 * - não existe → criada com o morador como contato;
 * - existe sem morador vinculado (cadastro prévio do síndico/admin) → o
 *   morador a reivindica (ownerEmail/ownerName preenchidos);
 * - existe vinculada a outro e-mail → cadastro bloqueado, morador deve
 *   procurar o síndico.
 */
export class RegisterClientUseCase {
  async execute(input: RegisterClientInput): Promise<RegisteredClient> {
    const email = input.email.trim().toLowerCase()
    const block = input.block?.trim() || null
    const identifier = input.unitIdentifier.trim()
    if (!identifier) {
      throw new ValidationError("Informe a unidade.")
    }

    const condominium = await prisma.condominium.findUnique({
      where: { id: input.condominiumId },
      include: { tenant: true },
    })
    if (!condominium || !condominium.active || !condominium.tenant.active) {
      throw new NotFoundError("Condominium", input.condominiumId)
    }

    const passwordHash = await hashPassword(input.password)

    // Unit + User criados atomicamente: falha parcial não deixa Unit órfã.
    // Rótulo da unidade no formato canônico do banco (não o digitado pelo morador).
    let unitBlock = block
    let unitIdentifier = identifier

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } })
      if (existing) {
        throw new ValidationError("E-mail já cadastrado.")
      }

      const unit = await tx.unit.findFirst({
        where: {
          condominiumId: condominium.id,
          identifier: { equals: identifier, mode: "insensitive" },
          ...(block ? { block: { equals: block, mode: "insensitive" } } : { block: null }),
        },
      })
      if (!unit) {
        await tx.unit.create({
          data: {
            condominiumId: condominium.id,
            identifier,
            block,
            ownerName: input.name.trim(),
            ownerEmail: email,
          },
        })
      } else if (!unit.ownerEmail) {
        // Unidade pré-cadastrada pelo síndico/admin sem morador: reivindica.
        await tx.unit.update({
          where: { id: unit.id },
          data: {
            ownerEmail: email,
            ownerName: unit.ownerName ?? input.name.trim(),
          },
        })
      } else if (unit.ownerEmail.toLowerCase() !== email) {
        throw new ValidationError(
          "Esta unidade já está vinculada a outro morador. Procure o síndico do condomínio para atualizar o cadastro.",
        )
      }
      if (unit) {
        unitBlock = unit.block
        unitIdentifier = unit.identifier
      }

      return tx.user.create({
        data: {
          tenantId: condominium.tenantId,
          condominiumId: condominium.id,
          name: input.name.trim(),
          email,
          passwordHash,
          role: "CLIENT",
          active: true,
          lgpdConsentAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true },
      })
    })

    logger.info("client.registered", {
      tenantId: condominium.tenantId,
      userId: user.id,
      condominiumId: condominium.id,
    })

    return {
      ...user,
      tenantId: condominium.tenantId,
      condominiumId: condominium.id,
      unitLabel: unitBlock ? `${unitBlock} / ${unitIdentifier}` : unitIdentifier,
    }
  }
}
