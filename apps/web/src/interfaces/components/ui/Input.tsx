import type { InputHTMLAttributes } from "react"
import { cn } from "@/shared/cn"
import { Icon, type IconName } from "./Icon"

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: boolean
  icon?: IconName
  prefix?: string
  mono?: boolean
}

export function Input({
  label,
  hint,
  error,
  icon,
  prefix,
  mono,
  className,
  id,
  ...rest
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-sm border bg-surface px-3 max-md:min-h-11",
          "focus-within:ring-2 focus-within:ring-green-400",
          error ? "border-iron-500" : "border-line-strong",
          rest.readOnly && "bg-bone-100",
        )}
      >
        {icon && <Icon name={icon} className="text-ink-400" />}
        {prefix && <span className="font-mono text-sm text-ink-400">{prefix}</span>}
        <input
          id={id}
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent text-base text-ink-900 outline-none md:text-sm",
            "placeholder:text-ink-300",
            mono && "font-mono",
            className,
          )}
          {...rest}
        />
      </div>
      {hint && (
        <div className={cn("text-xs", error ? "text-iron-600" : "text-ink-400")}>
          {hint}
        </div>
      )}
    </div>
  )
}
