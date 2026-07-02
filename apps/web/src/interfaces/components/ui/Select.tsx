import type { SelectHTMLAttributes } from "react"
import { cn } from "@/shared/cn"
import { Icon } from "./Icon"

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({ label, className, id, children, ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={cn(
            "h-10 w-full appearance-none rounded-sm border border-line-strong bg-surface max-md:min-h-11",
            "pl-3 pr-9 text-base text-ink-900 outline-none md:text-sm",
            "focus:ring-2 focus:ring-green-400",
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <Icon
          name="chev"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-500"
        />
      </div>
    </div>
  )
}
