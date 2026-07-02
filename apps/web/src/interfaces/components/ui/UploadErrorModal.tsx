'use client'

import { cn } from '@/shared/cn'
import { Button } from './Button'
import { Icon } from './Icon'

export interface UploadFile {
  /** Nome do arquivo. */
  name: string
  /** Tamanho formatado, ex.: "2.1 MB". */
  size: string
  /** 'ok' = enviado com sucesso, 'rejected' = rejeitado. */
  status: 'ok' | 'rejected'
  /** Motivo da rejeição em linguagem simples (apenas para status 'rejected'). */
  reason?: string
}

interface UploadErrorModalProps {
  files: UploadFile[]
  onClose: () => void
  /** Ação para reenviar os arquivos que falharam. */
  onRetry?: () => void
}

/**
 * Modal exibido quando parte ou todos os arquivos de um upload são rejeitados.
 * Mostra quais falharam, o motivo em linguagem clara e os requisitos de formato.
 */
export function UploadErrorModal({ files, onClose, onRetry }: UploadErrorModalProps) {
  const failed = files.filter((f) => f.status === 'rejected')
  const succeeded = files.filter((f) => f.status === 'ok')

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      {/* Modal */}
      <div className="absolute left-1/2 top-1/2 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-surface shadow-4">
        <div className="h-1 bg-iron-500" />
        <div className="p-7">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-snug text-ink-900">
                {failed.length === 1
                  ? 'Não consegui enviar 1 arquivo.'
                  : `Não consegui enviar ${failed.length} arquivos.`}
              </h2>
              {succeeded.length > 0 && (
                <p className="mt-1 text-sm text-ink-500">
                  {succeeded.length === 1
                    ? 'O outro arquivo foi enviado normalmente.'
                    : `Os outros ${succeeded.length} arquivos foram enviados normalmente.`}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 text-ink-400 transition-colors hover:text-ink-700"
              aria-label="Fechar"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Lista de arquivos */}
          <div className="mt-5 space-y-2">
            {files.map((file, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 rounded-sm p-3',
                  file.status === 'rejected' ? 'bg-iron-100' : 'bg-bone-50',
                )}
              >
                <Icon
                  name="doc"
                  size={14}
                  className={cn(
                    'shrink-0',
                    file.status === 'rejected' ? 'text-iron-600' : 'text-green-600',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{file.name}</p>
                  {file.reason && (
                    <p
                      className={cn(
                        'mt-0.5 text-xs',
                        file.status === 'rejected' ? 'text-iron-600' : 'text-ink-500',
                      )}
                    >
                      {file.reason}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs text-ink-400">{file.size}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-xs px-1.5 py-0.5 font-mono text-xs uppercase tracking-caps text-white',
                    file.status === 'rejected' ? 'bg-iron-600' : 'bg-green-600',
                  )}
                >
                  {file.status === 'rejected' ? 'rejeitado' : 'enviado'}
                </span>
              </div>
            ))}
          </div>

          {/* Requisitos */}
          <div className="mt-4 rounded-sm bg-bone-100 p-3 text-sm leading-relaxed text-ink-500">
            Aceitamos{' '}
            <strong className="text-ink-700">PDF, JPG, PNG e DOCX</strong> até{' '}
            <strong className="text-ink-700">50 MB</strong> por arquivo. Para arquivos de
            projeto (CAD, BIM), exporte como PDF antes de enviar.
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {onRetry && (
              <Button variant="secondary" icon="upload" onClick={onRetry}>
                Tentar novamente
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
