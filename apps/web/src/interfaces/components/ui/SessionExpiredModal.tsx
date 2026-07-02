'use client'

import { signIn, signOut } from 'next-auth/react'

import { Avatar } from './Avatar'
import { Button } from './Button'

interface SessionExpiredModalProps {
  /** Dados do usuário para exibir no cartão (opcionais). */
  user?: { name?: string | null; email?: string | null }
}

/**
 * Modal exibido quando a sessão expira durante o uso.
 * Sobrepõe a interface atual sem perder contexto.
 *
 * Uso: renderize condicionalmente quando um endpoint retornar 401.
 */
export function SessionExpiredModal({ user }: SessionExpiredModalProps) {
  const firstName = user?.name?.split(' ')[0] ?? ''

  return (
    <div className="fixed inset-0 z-50">
      {/* Fundo desfocado */}
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" />

      {/* Modal */}
      <div className="absolute left-1/2 top-1/2 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-surface shadow-4">
        {/* Barra de atenção */}
        <div className="h-1 bg-ochre-500" />

        <div className="p-8">
          <h2 className="text-2xl font-semibold tracking-snug text-ink-900">
            Sessão expirada
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Por segurança, encerramos sessões após um período sem atividade. Faça login
            novamente para continuar — os dados que você estava editando foram salvos.
          </p>

          {/* Cartão do usuário */}
          {user?.name && (
            <div className="mt-5 flex items-center gap-3 rounded-sm bg-bone-100 p-3">
              <Avatar name={user.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
                {user.email && (
                  <p className="truncate text-xs text-ink-500">{user.email}</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sair
            </Button>
            <Button
              variant="primary"
              iconRight="arrow"
              onClick={() => signIn()}
            >
              {firstName ? `Continuar como ${firstName}` : 'Fazer login'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
