"use client"
import { signIn, getSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import Link from "next/link"
import { Logo, Button, Input, Icon, Badge } from "@/interfaces/components/ui"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) {
      setLoading(false)
      setError("Credenciais inválidas")
      return
    }

    // Role-based redirect
    const callbackUrl = params.get("callbackUrl")
    if (callbackUrl) {
      router.push(callbackUrl)
      return
    }

    const session = await getSession()
    const role = (session?.user as any)?.role as string | undefined
    if (role === "CONDOMINIUM") {
      router.push("/sindico/dashboard")
    } else if (role === "PARTNER") {
      router.push("/partner/dashboard")
    } else if (role === "ADMIN" || role === "SUPER_ADMIN") {
      router.push("/dashboard")
    } else {
      router.push("/cases")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden">
      {/* Left — form */}
      <div className="flex flex-col overflow-y-auto bg-paper px-6 py-10 sm:px-10 lg:px-16">
        <Logo size={32} variant="lockup" />

        <div className="flex max-w-[360px] flex-1 flex-col justify-center">
          <p className="font-mono text-xs uppercase tracking-caps text-green-700">
            Entrar
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
            Bem-vindo de volta.
          </h1>
          <p className="mb-5 mt-1.5 text-base text-ink-500">
            Sua reforma começa aqui. A IA conduz, mas você decide.
          </p>

          {params.get("registered") === "1" && (
            <p className="mb-4 rounded-sm bg-green-100 px-3 py-2 text-sm text-green-700">
              Conta criada com sucesso. Faça login para continuar.
            </p>
          )}

          {params.get("reset") === "1" && (
            <p className="mb-4 rounded-sm bg-green-100 px-3 py-2 text-sm text-green-700">
              Senha redefinida com sucesso. Entre com sua nova senha.
            </p>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon="user"
              required
              autoComplete="email"
              data-testid="login-email"
            />
            <div className="relative">
              <Input
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon="lock"
                required
                autoComplete="current-password"
                data-testid="login-password"
              />
              <Link
                href="/forgot-password"
                className="absolute right-0 top-0 text-xs text-green-700 hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>

            {error && (
              <p className="text-sm text-iron-600" data-testid="login-error">
                {error}
              </p>
            )}

            <div className="mt-1">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                iconRight="arrow"
                disabled={loading}
                className="w-full"
                data-testid="login-submit"
              >
                {loading ? "Entrando…" : "Entrar"}
              </Button>
            </div>
          </form>

          <p className="mt-5 text-sm text-ink-500">
            Morador sem conta?{" "}
            <Link href="/register" className="font-medium text-green-700 hover:underline">
              Cadastre-se
            </Link>
          </p>

          <div className="mt-6 border-t border-divider pt-4 text-xs leading-relaxed text-ink-500">
            Ao continuar, você concorda com os{" "}
            <a href="#" className="text-ink-700 underline">
              Termos
            </a>{" "}
            e o tratamento de dados conforme a{" "}
            <a href="#" className="text-ink-700 underline">
              LGPD
            </a>
            .{" "}
            <strong className="text-ink-700">
              A plataforma não emite ART/RRT.
            </strong>
          </div>
        </div>

        <div className="font-mono text-[10px] uppercase tracking-caps text-ink-400">
          ReformAI · multi-tenant SaaS
        </div>
      </div>

      {/* Right — concreto verde */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-green-900 px-14 py-10 text-bone-50 lg:flex">
        {/* decorative circles */}
        <svg
          className="pointer-events-none absolute -right-[100px] -top-20 opacity-[0.18]"
          width={640}
          height={640}
          viewBox="0 0 640 640"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="320" cy="320" r="300" stroke="var(--rai-green-300)" strokeWidth="1" />
          <circle cx="320" cy="320" r="220" stroke="var(--rai-green-300)" strokeWidth="1" />
          <circle cx="320" cy="320" r="140" stroke="var(--rai-green-300)" strokeWidth="1" />
          <path
            d="M120 320 Q320 120 520 320 Q320 520 120 320"
            stroke="var(--rai-green-400)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        <div className="relative">
          <Badge tone="greenSolid">3 etapas · ~7 min</Badge>
        </div>

        <div className="relative">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight">
            Triagem técnica
            <br />
            <span className="text-green-300">conduzida por IA.</span>
            <br />
            Liberação por regra.
          </h2>

          <div className="mt-6 grid max-w-[420px] gap-3">
            {[
              [
                "01",
                "Descreva sua obra no chat",
                "A IA classifica o escopo e calcula o risco.",
              ],
              [
                "02",
                "Envie os documentos pedidos",
                "Memorial, projeto, autorização. A IA valida.",
              ],
              [
                "03",
                "Receba a liberação",
                "Ou indicação de profissional para emitir a ART.",
              ],
            ].map(([n, t, d]) => (
              <div
                key={n}
                className="grid grid-cols-[36px_1fr] items-start gap-3"
              >
                <div className="pt-0.5 font-mono text-sm tracking-[0.05em] text-green-300">
                  {n}
                </div>
                <div>
                  <div className="text-base font-medium text-bone-50">{t}</div>
                  <div className="mt-0.5 text-sm leading-normal text-ink-200">
                    {d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* disclaimer */}
        <div className="relative flex max-w-[460px] items-center gap-3.5 rounded-sm bg-green-800 px-4 py-3.5">
          <span className="shrink-0 text-green-300">
            <Icon name="shield" size={18} />
          </span>
          <div className="text-xs leading-normal text-ink-200">
            <strong className="text-bone-50">
              A plataforma não emite ART/RRT.
            </strong>
            <br />
            A emissão formal é do profissional habilitado parceiro. Cada
            decisão fica auditada.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-ink-500">Carregando…</div>}>
      <LoginForm />
    </Suspense>
  )
}
