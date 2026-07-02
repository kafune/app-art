'use client'

import { useEffect } from 'react'

import { reportClientError } from '@/shared/reportClientError'

/**
 * global-error.tsx substitui o layout raiz inteiro — Tailwind não está disponível.
 * Usa inline styles para garantir funcionamento mesmo sem CSS.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]', error)
    reportClientError(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: '#FBF8F1',
        }}
      >
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          {/* Logo mark simples */}
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <rect width="44" height="44" rx="4" fill="#163528" />
            <rect x="12" y="12" width="9" height="20" rx="1.5" fill="#9FC9B3" />
            <rect x="23" y="12" width="9" height="12" rx="1.5" fill="#3A8163" />
          </svg>

          <h1
            style={{
              margin: '24px 0 0',
              fontSize: '28px',
              fontWeight: 600,
              color: '#14130D',
              letterSpacing: '-0.02em',
            }}
          >
            Algo deu errado.
          </h1>

          <p
            style={{
              margin: '12px 0 0',
              fontSize: '15px',
              color: '#5C5742',
              maxWidth: '400px',
              lineHeight: 1.55,
            }}
          >
            Houve um problema inesperado. Tente novamente — seus dados estão
            seguros.
          </p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                background: '#1F4A37',
                color: '#FBF8F1',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => { window.location.href = '/' }}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#2A271C',
                border: '1px solid #2A271C',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Ir para o início
            </button>
          </div>

          <p style={{ marginTop: '32px', fontSize: '12px', color: '#7E7860' }}>
            ReformAI · plataforma técnico-operacional
          </p>
        </div>
      </body>
    </html>
  )
}
