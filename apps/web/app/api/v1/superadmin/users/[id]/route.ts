import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser } from "@/infrastructure/auth/getSessionUser"
import { handleError, unauthorized } from "@/interfaces/http/respond"
import { prisma } from "@/infrastructure/database/prisma"

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  tenant: { select: { id: true, name: true, slug: true } },
  condominium: { select: { id: true, name: true } },
} as const

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email("E-mail inválido.").optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "MANAGER", "CONDOMINIUM", "CLIENT", "PARTNER"]).optional(),
  tenantId: z.string().min(1).optional(),
  condominiumId: z.string().min(1).nullable().optional(),
})

const forbidden = () => NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
const business = (message: string) =>
  NextResponse.json({ error: "BUSINESS_RULE_VIOLATION", message }, { status: 422 })
const notFound = (message: string) => NextResponse.json({ error: "NOT_FOUND", message }, { status: 404 })

/**
 * Exclui um usuário (SUPER_ADMIN).
 * Bloqueado se: própria conta | tem casos vinculados | tem registro de parceiro.
 */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const sessionUser = await requireSessionUser()
    if (sessionUser.role !== "SUPER_ADMIN") return forbidden()

    const target = await prisma.user.findUnique({
      where: { id: ctx.params.id },
      include: {
        partner: { select: { id: true } },
        cases: { select: { id: true }, take: 1 },
      },
    })
    if (!target) return notFound("Usuário não encontrado.")

    if (target.id === sessionUser.id) {
      return business("Você não pode excluir a própria conta.")
    }

    if (target.partner) {
      return business(
        "Este usuário tem cadastro de parceiro. Remova-o em Gestão de Parceiros antes de excluir.",
      )
    }

    if (target.cases.length > 0) {
      return business(
        "Este usuário possui casos vinculados e não pode ser excluído. Desative-o em vez disso.",
      )
    }

    // Remove registros dependentes com userId não-nulo sem cascade configurado.
    // AuditLog.userId é nullable → SetNull automático pelo Prisma (não precisa tratar).
    await prisma.$transaction([
      prisma.pushSubscription.deleteMany({ where: { userId: target.id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: target.id } }),
      prisma.notification.deleteMany({ where: { userId: target.id } }),
      prisma.user.delete({ where: { id: target.id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}

/**
 * Atualiza um usuário (SUPER_ADMIN). Suporta:
 *  - body vazio → alterna ativo/inativo
 *  - name/role/tenantId/condominiumId → edição de campos com validações
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const sessionUser = await requireSessionUser()
    if (sessionUser.role !== "SUPER_ADMIN") return forbidden()

    const target = await prisma.user.findUnique({
      where: { id: ctx.params.id },
      include: { partner: { select: { id: true } } },
    })
    if (!target) return notFound("Usuário não encontrado.")

    const raw = await req.json().catch(() => ({}))
    const body = UpdateUserSchema.parse(raw)

    // ─── Body vazio: toggle de ativo ───────────────────────────────
    if (Object.keys(body).length === 0) {
      if (target.id === sessionUser.id) {
        return business("Você não pode desativar a própria conta.")
      }
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { active: !target.active },
        select: USER_SELECT,
      })
      return NextResponse.json({ user: updated })
    }

    // ─── Edição de campos ──────────────────────────────────────────
    const finalRole = body.role ?? target.role
    const finalTenantId = body.tenantId ?? target.tenantId

    // Unicidade de e-mail: verifica colisão com outro usuário.
    if (body.email && body.email.toLowerCase() !== target.email.toLowerCase()) {
      const conflict = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
      if (conflict) return business("Este e-mail já está em uso por outro usuário.")
    }

    // Não permitir auto-rebaixamento (evita lockout do dono da plataforma).
    if (target.id === sessionUser.id && finalRole !== "SUPER_ADMIN") {
      return business("Você não pode alterar o próprio papel de SUPER_ADMIN.")
    }

    // Acoplamento com Partner: papel PARTNER é gerido em /admin/partners.
    if (target.partner && finalRole !== "PARTNER") {
      return business("Este usuário tem cadastro de parceiro; altere o papel pela gestão de parceiros.")
    }
    if (!target.partner && finalRole === "PARTNER") {
      return business("Crie parceiros pela gestão de parceiros (cria User + Partner juntos).")
    }

    // Tenant precisa existir.
    if (body.tenantId && body.tenantId !== target.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: finalTenantId } })
      if (!tenant) return notFound("Tenant não encontrado.")
    }

    // Resolve o vínculo de condomínio coerente com papel + tenant.
    // - body.condominiumId definido → usa; senão mantém o atual (revalidado).
    let finalCondominiumId: string | null =
      body.condominiumId !== undefined ? body.condominiumId : target.condominiumId

    if (finalRole !== "CONDOMINIUM") {
      // Outros papéis não carregam vínculo de síndico.
      if (body.condominiumId) {
        return business("Vínculo de condomínio só se aplica a síndicos (CONDOMINIUM).")
      }
      finalCondominiumId = null
    } else {
      if (!finalCondominiumId) {
        return business("Síndico precisa estar vinculado a um condomínio.")
      }
      const condominium = await prisma.condominium.findUnique({ where: { id: finalCondominiumId } })
      if (!condominium || condominium.tenantId !== finalTenantId) {
        return notFound("Condomínio não encontrado neste tenant.")
      }
    }

    const tenantChanged = finalTenantId !== target.tenantId

    const updated = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: target.id },
        data: {
          name: body.name?.trim() ?? undefined,
          email: body.email ? body.email.trim().toLowerCase() : undefined,
          role: finalRole,
          tenantId: finalTenantId,
          condominiumId: finalCondominiumId,
        },
        select: USER_SELECT,
      })

      // Partner.tenantId é denormalizado de User.tenantId (não há FK entre
      // eles). Sem sincronizar aqui, o parceiro some das listagens do tenant
      // novo (GET /admin/partners, GET /partners) e fica preso ao antigo.
      if (target.partner && tenantChanged) {
        await tx.partner.update({
          where: { id: target.partner.id },
          data: { tenantId: finalTenantId },
        })

        // Remove vínculos de "parceiro fixo" em condomínios do tenant
        // antigo — mantê-los apontando para um parceiro de outro tenant
        // violaria o isolamento por tenant (CLAUDE.md §2.4).
        await tx.condominium.updateMany({
          where: { partnerId: target.partner.id },
          data: { partnerId: null },
        })
      }

      return updatedUser
    })

    return NextResponse.json({ user: updated })
  } catch (err) {
    if ((err as Error).message === "UNAUTHORIZED") return unauthorized()
    return handleError(err)
  }
}
