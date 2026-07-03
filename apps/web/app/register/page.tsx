"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Logo, Icon, SearchInput } from "@/interfaces/components/ui"

interface CondominiumRow {
  id: string
  name: string
  city: string
  state: string
}

/**
 * Autocadastro de morador — passo 1: escolher o condomínio.
 * Quem chega pelo QR code do síndico pula esta tela e cai direto em
 * /register/[condominiumId].
 */
export default function RegisterPage() {
  const [condominiums, setCondominiums] = useState<CondominiumRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/v1/public/condominiums")
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((d) => setCondominiums(d.condominiums ?? []))
      .catch(() => setError("Não foi possível carregar a lista de condomínios. Tente novamente."))
      .finally(() => setLoading(false))
  }, [])

  const filtered = condominiums.filter(
    (c) =>
      search === "" ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex min-h-screen flex-col bg-paper px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-[480px]">
        <Logo size={32} variant="lockup" />

        <p className="mt-8 font-mono text-xs uppercase tracking-caps text-green-700">
          Cadastro de morador
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          Em qual condomínio você mora?
        </h1>
        <p className="mb-5 mt-1.5 text-base text-ink-500">
          Selecione seu condomínio para criar sua conta e iniciar a triagem da sua reforma.
        </p>

        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou cidade…" />

        <div className="mt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-ink-400">Carregando condomínios…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-iron-600">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-bone-400 p-8 text-center">
              <p className="text-sm font-medium text-ink-700">
                {search
                  ? `Nenhum condomínio encontrado para “${search}”.`
                  : "Nenhum condomínio disponível para cadastro."}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Se o seu condomínio não aparece aqui, fale com o síndico — ele pode enviar o link
                de cadastro direto.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-divider overflow-hidden rounded-md bg-surface shadow-hair">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/register/${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-bone-50"
                  data-testid="register-condominium-item"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
                    <p className="text-xs text-ink-500">
                      {c.city} · {c.state}
                    </p>
                  </div>
                  <Icon name="arrow" size={16} className="shrink-0 text-green-700" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 border-t border-divider pt-4 text-sm text-ink-500">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-green-700 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
