import { redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { prisma } from "@/infrastructure/database/prisma"
import { AppShell, type NavItem } from "@/interfaces/components/ui"
import { SignOutButton } from "@/interfaces/components/SignOutButton"

const NAV: NavItem[] = [
  { href: "/sindico/dashboard", icon: "grid", label: "Visão geral" },
  { href: "/sindico/cases", icon: "list", label: "Casos do condomínio" },
  { href: "/sindico/parceiro", icon: "shield", label: "Parceiro técnico" },
  { href: "/sindico/cadastro", icon: "user", label: "Cadastro de moradores" },
]

export default async function SindicoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!user) {
    redirect("/login")
  }

  if (user.role !== "CONDOMINIUM") {
    redirect("/cases")
  }

  const condominium = user.condominiumId
    ? await prisma.condominium.findFirst({
        where: {
          id: user.condominiumId,
          tenantId: user.tenantId,
        },
        select: { name: true },
      })
    : null

  return (
    <AppShell
      nav={NAV}
      brandLabel={condominium?.name ?? "Condomínio"}
      brandSub="Condomínio"
      user={{ name: user.name, sub: user.email }}
      footer={
        <SignOutButton className="text-xs text-bone-400 hover:text-bone-100 transition-colors" />
      }
    >
      {children}
    </AppShell>
  )
}
