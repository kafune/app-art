import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined
}

export type TemplateId =
  | "relatorio-analise"
  | "memorial-descritivo"
  | "cronograma-basico"
  | "parecer-pendencias"
  | "proposta-comercial"
  | "ordem-servico"

const VALID_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>([
  "relatorio-analise",
  "memorial-descritivo",
  "cronograma-basico",
  "parecer-pendencias",
  "proposta-comercial",
  "ordem-servico",
])

const MISSING_PLACEHOLDER = "[CAMPO NÃO PREENCHIDO]"

const DISCLAIMER =
  "\n\n---\n\n" +
  "*Este documento foi gerado com auxílio de inteligência artificial pela plataforma " +
  "ReformAI e tem caráter meramente informativo e auxiliar. Não substitui laudo técnico, " +
  "ART/RRT ou qualquer documento oficial emitido por profissional habilitado. A " +
  "responsabilidade técnica pela obra é exclusiva do profissional responsável devidamente " +
  "registrado no CREA/CAU.*\n"

// Quando o pacote é transpilado pelo Next (webpack), import.meta.url vira o
// caminho do fonte NA MÁQUINA DE BUILD — que pode não existir no runtime
// (ex.: imagem Docker que só recebe o output standalone). Por isso testamos
// caminhos candidatos em ordem, do mais específico ao mais genérico.
const bakedDir = path.dirname(fileURLToPath(import.meta.url))
const candidateDirs = [
  bakedDir,
  path.join(process.cwd(), "packages", "templates"),
  path.join(process.cwd(), "..", "..", "packages", "templates"),
]

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
const cache = new Map<TemplateId, string>()

function loadTemplate(templateId: TemplateId): string {
  const cached = cache.get(templateId)
  if (cached !== undefined) return cached

  const tried: string[] = []
  for (const dir of candidateDirs) {
    const filePath = path.join(dir, `${templateId}.md`)
    tried.push(filePath)
    try {
      const content = readFileSync(filePath, "utf8")
      cache.set(templateId, content)
      return content
    } catch {
      // tenta o próximo candidato
    }
  }

  throw new Error(
    `Template "${templateId}.md" não encontrado. Caminhos tentados: ${tried.join(", ")}. ` +
      "Em produção, garanta que packages/templates/*.md esteja presente na imagem/runtime.",
  )
}

function resolveValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return MISSING_PLACEHOLDER
  if (typeof value === "string" && value.trim() === "") return MISSING_PLACEHOLDER
  return String(value)
}

export function renderTemplate(
  templateId: TemplateId,
  variables: TemplateVariables,
): string {
  if (!VALID_TEMPLATES.has(templateId)) {
    throw new Error(`Template inválido: "${templateId}"`)
  }
  const raw = loadTemplate(templateId)
  const rendered = raw.replace(VARIABLE_PATTERN, (_, key: string) =>
    resolveValue(variables[key]),
  )
  return rendered.trimEnd() + DISCLAIMER
}
