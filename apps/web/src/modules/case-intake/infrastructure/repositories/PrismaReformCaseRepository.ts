import type { Prisma, ReformCase } from "@reformai/database"
import { prisma } from "@/infrastructure/database/prisma"
import { TenantIsolationError } from "@/shared/errors/DomainError"
import type {
  ChatMessageDTO,
  CreateCaseInput,
  ReformCaseRepository,
  UpdateScopeInput,
} from "../../domain/repositories/ReformCaseRepository"

export class PrismaReformCaseRepository implements ReformCaseRepository {
  async create(input: CreateCaseInput): Promise<ReformCase> {
    return prisma.reformCase.create({
      data: {
        tenantId: input.tenantId,
        condominiumId: input.condominiumId,
        unitId: input.unitId,
        clientId: input.clientId,
        protocol: input.protocol,
        status: "DRAFT",
      },
    })
  }

  async findById(id: string, tenantId: string): Promise<ReformCase | null> {
    const row = await prisma.reformCase.findFirst({ where: { id, tenantId } })
    return row
  }

  async listByTenant(
    tenantId: string,
    filters?: {
      clientId?: string
      condominiumId?: string
      partnerId?: string
      /** Casos atribuídos ao parceiro OU de condomínios onde ele é o parceiro fixo. */
      partnerScopeId?: string
      search?: string
    },
  ): Promise<ReformCase[]> {
    const search = filters?.search?.trim()

    // Blocos OR independentes (escopo do parceiro × busca textual) combinados
    // via AND para não se sobrescreverem no objeto where.
    const and: Prisma.ReformCaseWhereInput[] = []
    if (filters?.partnerScopeId) {
      and.push({
        OR: [
          { partnerId: filters.partnerScopeId },
          { condominium: { partnerId: filters.partnerScopeId } },
        ],
      })
    }
    if (search) {
      and.push({
        OR: [
          { protocol: { contains: search, mode: "insensitive" } },
          { unit: { identifier: { contains: search, mode: "insensitive" } } },
          { unit: { ownerName: { contains: search, mode: "insensitive" } } },
          { client: { name: { contains: search, mode: "insensitive" } } },
          { client: { email: { contains: search, mode: "insensitive" } } },
        ],
      })
    }

    return prisma.reformCase.findMany({
      where: {
        tenantId,
        ...(filters?.clientId ? { clientId: filters.clientId } : {}),
        ...(filters?.condominiumId ? { condominiumId: filters.condominiumId } : {}),
        ...(filters?.partnerId ? { partnerId: filters.partnerId } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
      },
      // Relações exibidas nas listagens (síndico, parceiro, fila de revisão)
      include: {
        unit: { select: { id: true, identifier: true, block: true } },
        condominium: { select: { id: true, name: true } },
        inspections: {
          where: { status: "SCHEDULED" },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, type: true, scheduledAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  async applyScopeClassification(
    caseId: string,
    tenantId: string,
    input: UpdateScopeInput,
  ): Promise<ReformCase> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.reformCase.findFirst({ where: { id: caseId, tenantId } })
      if (!existing) throw new TenantIsolationError()

      const updated = await tx.reformCase.update({
        where: { id: caseId },
        data: {
          status: input.newStatus,
          riskLevel: input.riskLevel,
          requiresART: input.requiresART,
          triageScore: input.triageScore,
          reformScope: input.scope as object,
          evaluationResult: input.evaluationResult as object,
        },
      })

      await tx.caseTransitionLog.create({
        data: {
          caseId,
          fromStatus: input.previousStatus,
          toStatus: input.newStatus,
          triggeredBy: input.triggeredBy,
          reason: input.reason,
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          caseId,
          action: "case.scope.classified",
          triggeredBy: input.triggeredBy,
          aiReasoning: input.evaluationResult as object,
        },
      })

      return updated
    })
  }

  async appendMessage(
    caseId: string,
    tenantId: string,
    role: "USER" | "ASSISTANT" | "SYSTEM",
    content: string,
    metadata?: unknown,
  ): Promise<ChatMessageDTO> {
    const existing = await prisma.reformCase.findFirst({ where: { id: caseId, tenantId } })
    if (!existing) throw new TenantIsolationError()
    const row = await prisma.chatMessage.create({
      data: { caseId, role, content, metadata: metadata as object | undefined },
      select: { id: true, role: true, content: true, createdAt: true },
    })
    return { ...row, role: String(row.role) }
  }

  async listMessages(caseId: string, tenantId: string) {
    const existing = await prisma.reformCase.findFirst({ where: { id: caseId, tenantId } })
    if (!existing) throw new TenantIsolationError()
    const rows = await prisma.chatMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    })
    return rows.map((r) => ({ ...r, role: String(r.role) }))
  }
}
