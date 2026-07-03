"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { Logo, Button, Input, Icon, Checkbox } from "@/interfaces/components/ui"

interface CondominiumInfo {
  id: string
  name: string
  city: string
  state: string
}

/**
 * Autocadastro de morador — passo 2: formulário do condomínio escolhido
 * (ou destino direto do QR code afixado pelo síndico).
 * Após criar a conta, faz login automático e leva direto à triagem.
 */
export default function RegisterCondominiumPage() {
  const params = useParams<{ condominiumId: string }>()
  const router = useRouter()

  const [condominium, setCondominium] = useState<CondominiumInfo | null>(null)
  const [loadingCondo, setLoadingCondo] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [block, setBlock] = useState("")
  const [unitIdentifier, setUnitIdentifier] = useState("")
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!params?.condominiumId) return
    fetch(`/api/v1/public/condominiums/${params.condominiumId}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true)
          return
        }
        const d = await r.json()
        setCondominium(d.condominium ?? null)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingCondo(false))
  }, [params?.condominiumId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("As senhas não conferem.")
      return
    }
    if (!lgpdConsent) {
      setError("É necessário aceitar o tratamento de dados (LGPD) para se cadastrar.")
      return
    }

    setSubmitting(true)
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        condominiumId: params.condominiumId,
        block: block.trim() || undefined,
        unitIdentifier,
      }),
    })

    if (!res.ok) {
      setSubmitting(false)
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        setError("Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.")
      } else if (data.error === "VALIDATION" && Array.isArray(data.details)) {
        setError("Verifique os dados informados e tente novamente.")
      } else {
        setError(data.message ?? "Não foi possível concluir o cadastro. Tente novamente.")
      }
      return
    }

    // Conta criada — login automático e direto para a triagem.
    const login = await signIn("credentials", { email, password, redirect: false })
    if (login?.error) {
      // Cadastro ok mas login falhou (caso raro): manda para o login com aviso.
      router.push("/login?registered=1")
      return
    }
    router.push("/cases")
  }

  if (loadingCondo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-ink-500">
        Carregando…
      </div>
    )
  }

  if (notFound || !condominium) {
    return (
      <div className="flex min-h-screen flex-col bg-paper px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <Logo size={32} variant="lockup" />
          <div className="mt-12 rounded-md bg-surface p-6 text-center shadow-hair">
            <p className="font-medium text-ink-900">Link de cadastro inválido.</p>
            <p className="mt-1.5 text-sm text-ink-500">
              Este condomínio não está disponível para cadastro. Confira o link com o síndico ou{" "}
              <Link href="/register" className="text-green-700 underline">
                escolha seu condomínio na lista
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-[420px]">
        <Logo size={32} variant="lockup" />

        <p className="mt-8 font-mono text-xs uppercase tracking-caps text-green-700">
          Cadastro de morador
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {condominium.name}
        </h1>
        <p className="mb-5 mt-1.5 text-base text-ink-500">
          {condominium.city} · {condominium.state}. Crie sua conta para iniciar a triagem da
          reforma da sua unidade.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            label="Nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            icon="user"
            required
            minLength={3}
            autoComplete="name"
            data-testid="register-name"
          />
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon="user"
            required
            autoComplete="email"
            data-testid="register-email"
          />

          <div className="grid grid-cols-[1fr_1.4fr] gap-3">
            <Input
              label="Torre / bloco"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              placeholder="Ex.: A"
              hint="Opcional"
              autoComplete="off"
              data-testid="register-block"
            />
            <Input
              label="Unidade / apartamento"
              value={unitIdentifier}
              onChange={(e) => setUnitIdentifier(e.target.value)}
              placeholder="Ex.: 101"
              required
              autoComplete="off"
              data-testid="register-unit"
            />
          </div>

          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon="lock"
            required
            minLength={6}
            hint="Mínimo de 6 caracteres"
            autoComplete="new-password"
            data-testid="register-password"
          />
          <Input
            label="Confirmar senha"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon="lock"
            required
            autoComplete="new-password"
            data-testid="register-confirm-password"
          />

          <Checkbox
            checked={lgpdConsent}
            onChange={(e) => setLgpdConsent(e.target.checked)}
            data-testid="register-lgpd"
            label={
              <span className="text-xs leading-relaxed text-ink-600">
                Autorizo o tratamento dos meus dados para condução do processo de reforma,
                conforme a LGPD. O síndico do condomínio será notificado do meu cadastro.
              </span>
            }
          />

          {error && (
            <p className="text-sm text-iron-600" data-testid="register-error">
              {error}
            </p>
          )}

          <div className="mt-1">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              iconRight="arrow"
              disabled={submitting}
              className="w-full"
              data-testid="register-submit"
            >
              {submitting ? "Criando conta…" : "Criar conta e iniciar triagem"}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-sm text-ink-500">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-green-700 hover:underline">
            Entrar
          </Link>
        </p>

        <div className="mt-6 flex items-start gap-2.5 border-t border-divider pt-4">
          <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-green-700" />
          <p className="text-xs leading-relaxed text-ink-500">
            <strong className="text-ink-700">A plataforma não emite ART/RRT.</strong> A emissão
            formal é responsabilidade do profissional habilitado parceiro.
          </p>
        </div>
      </div>
    </div>
  )
}
