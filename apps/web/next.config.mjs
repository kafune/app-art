import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const allowedOrigins = ["localhost:3000"]
if (process.env.NEXT_PUBLIC_APP_URL) {
  try {
    allowedOrigins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).host)
  } catch {
    // ignora valor inválido
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ["@reformai/database", "@reformai/templates"],
  experimental: {
    // Raiz do monorepo: faz o standalone preservar o layout aninhado
    // (.next/standalone/apps/web/server.js + node_modules na raiz), que é o que
    // o Dockerfile.web espera. Sem isto o output sai achatado (server.js na raiz)
    // e os COPY de static/public + o CMD ficam todos no caminho errado.
    // (No Next 14 esta chave é experimental; virou top-level no Next 15.)
    outputFileTracingRoot: join(__dirname, '../../'),
    serverActions: { allowedOrigins },
    // Habilita instrumentation.ts (init de monitoramento + status de config no boot).
    instrumentationHook: true,
    // Pacotes que carregam binários nativos / arquivos por caminho relativo ao
    // módulo (fontes .afm do pdfkit, onnxruntime do transformers.js) ou que trazem
    // instrumentação OpenTelemetry (@sentry/node). Mantê-los externos evita que o
    // webpack quebre esses resolves no servidor.
    serverComponentsExternalPackages: [
      "pdfkit",
      "@huggingface/transformers",
      "onnxruntime-node",
      "@sentry/node",
    ],
  },
}

export default nextConfig
