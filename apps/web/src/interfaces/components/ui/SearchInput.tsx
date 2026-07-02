"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/shared/cn"
import { Icon } from "./Icon"

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar por protocolo, nome ou unidade...",
  className,
}: SearchInputProps) {
  const [local, setLocal] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external value → local (e.g. on reset from parent)
  useEffect(() => {
    setLocal(value)
  }, [value])

  function handleChange(next: string) {
    setLocal(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(next)
    }, 300)
  }

  function handleClear() {
    setLocal("")
    if (timerRef.current) clearTimeout(timerRef.current)
    onChange("")
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-surface px-3",
        "focus-within:ring-2 focus-within:ring-green-400",
        "max-md:min-h-11",
        className,
      )}
    >
      <Icon name="search" className="shrink-0 text-ink-400" size={15} />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-none bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-300 md:text-sm"
        aria-label="Buscar casos"
      />
      {local && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-sm text-ink-400 transition-colors hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
          aria-label="Limpar busca"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
