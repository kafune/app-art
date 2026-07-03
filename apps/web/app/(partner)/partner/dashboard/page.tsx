import { redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { CaseStatus } from "@reformai/database"
import { TopBar, Card, Eyebrow, Icon, RatingDisplay, type IconName } from "@/interfaces/components/ui"
import { PendingActionsWidget } from "@/interfaces/components/ui/PendingActionsWidget"

export const dynamic = "force-dynamic"

const ACTIVE_STATUSES: CaseStatus[] = [
  CaseStatus.ASSIGNED_TO_PARTNER,
  CaseStatus.ART_RRT_PENDING,
  CaseStatus.INSPECTIONS_SCHEDULED,
  CaseStatus.IN_EXECUTION,
]

const STAT_ICONS: IconName[] = ["check", "clock", "doc", "star"]

export default async function PartnerDashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "PARTNER") redirect("/cases")

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      tenantId: true,
      rating: true,
      _count: { select: { reviews: true } },
    },
  })

  if (!partner) {
    return (
      <div className="flex flex-col">
        <TopBar title="Dashboard" subtitle="Painel do parceiro" />
        <div className="p-8">
          <p className="text-sm text-iron-600">
            Perfil de parceiro não encontrado. Contate o administrador.
          </p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [activeCases, inspectionsToday, artPending, concludedThisMonth, myCondominiums] = await Promise.all([
    prisma.reformCase.count({
      where: {
        partnerId: partner.id,
        tenantId: user.tenantId,
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.inspection.count({
      where: {
        partnerId: partner.id,
        tenantId: user.tenantId,
        scheduledAt: { gte: startOfDay, lt: endOfDay },
        status: "SCHEDULED",
      },
    }),
    prisma.reformCase.count({
      where: {
        partnerId: partner.id,
        tenantId: user.tenantId,
        status: "ART_RRT_PENDING",
      },
    }),
    prisma.reformCase.count({
      where: {
        partnerId: partner.id,
        tenantId: user.tenantId,
        status: "CONCLUDED",
        updatedAt: { gte: startOfMonth },
      },
    }),
    // Condomínios onde este parceiro é o responsável técnico fixo
    prisma.condominium.findMany({
      where: { partnerId: partner.id, tenantId: user.tenantId, active: true },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        _count: {
          select: {
            cases: {
              where: { status: { notIn: ["CONCLUDED", "ARCHIVED"] } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ])

  const stats = [
    {
      label: "Casos ativos",
      value: activeCases,
      description: "Em execução, agendados ou aguardando ART",
      tone: "green" as const,
      icon: STAT_ICONS[0]!,
    },
    {
      label: "Vistorias hoje",
      value: inspectionsToday,
      description: "Agendadas para hoje",
      tone: "azulejo" as const,
      icon: STAT_ICONS[1]!,
    },
    {
      label: "ART/RRT pendente",
      value: artPending,
      description: "Casos aguardando ART/RRT",
      tone: "ochre" as const,
      icon: STAT_ICONS[2]!,
    },
    {
      label: "Concluídos no mês",
      value: concludedThisMonth,
      description: "Casos encerrados este mês",
      tone: "green" as const,
      icon: STAT_ICONS[3]!,
    },
  ]

  const ratingValue = partner.rating == null ? null : Number(partner.rating)
  const reviewCount = partner._count.reviews

  return (
    <div className="flex flex-col">
      <TopBar
        title="Dashboard"
        subtitle={`Bem-vindo, ${user.name}`}
      />

      <div className="flex-1 bg-bone-50 p-8">
        {/* Pending actions inbox */}
        <PendingActionsWidget />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} padded={false} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <Eyebrow className="truncate">{s.label}</Eyebrow>
                  <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-ink-900">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs text-ink-500">{s.description}</div>
                </div>
                <Icon
                  name={s.icon}
                  size={18}
                  className={
                    s.tone === "green"
                      ? "text-green-600"
                      : s.tone === "azulejo"
                        ? "text-azulejo-600"
                        : s.tone === "ochre"
                          ? "text-ochre-600"
                          : "text-green-600"
                  }
                />
              </div>
            </Card>
          ))}
        </div>

        {/* Condomínios sob responsabilidade técnica fixa */}
        {myCondominiums.length > 0 && (
          <div className="mt-6">
            <Card padded={false} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <Eyebrow>Meus condomínios (parceiro fixo)</Eyebrow>
                <Icon name="shield" size={18} className="text-green-600" />
              </div>
              <div className="divide-y divide-divider">
                {myCondominiums.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900">{c.name}</p>
                      <p className="text-xs text-ink-500">
                        {c.city} · {c.state}
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-ink-700">
                      {c._count.cases} caso{c._count.cases !== 1 ? "s" : ""} em andamento
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-400">
                Todos os casos destes condomínios aparecem em{" "}
                <span className="font-medium text-ink-600">Meus Casos → Condomínio</span>, mesmo
                antes de serem atribuídos a você.
              </p>
            </Card>
          </div>
        )}

        {/* Rating card */}
        <div className="mt-6">
          <Card padded={false} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <Eyebrow>Minha avaliação</Eyebrow>
                <div className="mt-2">
                  {ratingValue == null ? (
                    <p className="text-sm text-ink-500">
                      Ainda sem avaliações. Suas avaliações aparecerão aqui após cada obra concluída.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink-900">
                          {ratingValue.toFixed(1)}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg
                                key={star}
                                width={14}
                                height={14}
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className={
                                  star <= Math.round(ratingValue)
                                    ? "fill-ochre-400 stroke-ochre-500"
                                    : "fill-transparent stroke-ink-300"
                                }
                              >
                                <path d="M8 2l1.9 4 4.4.6-3.2 3 .8 4.4L8 12l-3.9 2 .8-4.4-3.2-3 4.4-.6L8 2z" />
                              </svg>
                            ))}
                          </div>
                          <span className="text-xs text-ink-400">
                            {reviewCount} avaliação{reviewCount !== 1 ? "ões" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <Icon name="star" size={24} className="text-ochre-400" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
