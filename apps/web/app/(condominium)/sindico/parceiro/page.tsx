import { redirect } from "next/navigation"
import { getSessionUser } from "@/infrastructure/auth/getSessionUser"
import { TopBar } from "@/interfaces/components/ui"
import { PartnerPicker } from "./PartnerPicker"

export const dynamic = "force-dynamic"

export default async function SindicoParceiroPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.role !== "CONDOMINIUM") redirect("/cases")

  if (!user.condominiumId) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Parceiro técnico" subtitle="Painel do condomínio" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="font-medium text-ink-700">Nenhum condomínio vinculado à sua conta.</p>
            <p className="mt-1 text-sm text-ink-400">
              Entre em contato com o administrador da plataforma.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title="Parceiro técnico" subtitle="Painel do condomínio" />
      <div className="p-6 md:p-8">
        <div className="max-w-[720px]">
          <h2 className="text-lg font-semibold text-ink-900">
            Responsável técnico do condomínio
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            O parceiro fixo acompanha todas as reformas do condomínio, recebe os casos que
            precisam de responsável técnico e emite as ART/RRT. Você pode trocá-lo a qualquer
            momento — casos já atribuídos não são alterados.
          </p>
          <div className="mt-5">
            <PartnerPicker condominiumId={user.condominiumId} />
          </div>
        </div>
      </div>
    </div>
  )
}
