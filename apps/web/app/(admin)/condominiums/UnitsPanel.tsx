"use client"
import { useCallback, useEffect, useState } from "react"
import { Button, Input, Eyebrow } from "@/interfaces/components/ui"
import type { Unit } from "./constants"

const EMPTY_UNIT = {
  identifier: "",
  block: "",
  floor: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
}
type UnitForm = typeof EMPTY_UNIT

const toForm = (u: Unit): UnitForm => ({
  identifier: u.identifier,
  block: u.block ?? "",
  floor: u.floor ?? "",
  ownerName: u.ownerName ?? "",
  ownerEmail: u.ownerEmail ?? "",
  ownerPhone: u.ownerPhone ?? "",
})

const COLS = "grid min-w-[720px] grid-cols-[120px_90px_90px_1fr_1fr_150px] items-center gap-3"

/** Painel de gestão das unidades de um condomínio (CRUD inline). */
export function UnitsPanel({
  condominiumId,
  onCountChange,
}: {
  condominiumId: string
  onCountChange: (delta: number) => void
}) {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<UnitForm>(EMPTY_UNIT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<UnitForm>(EMPTY_UNIT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const base = `/api/v1/admin/condominiums/${condominiumId}/units`

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(base)
    if (res.ok) setUnits((await res.json()).units ?? [])
    setLoading(false)
  }, [base])

  useEffect(() => {
    load()
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? data.error ?? "Erro ao criar unidade.")
      return
    }
    setForm(EMPTY_UNIT)
    setShowForm(false)
    onCountChange(1)
    load()
  }

  async function saveEdit(id: string) {
    setError(null)
    setSaving(true)
    const res = await fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? data.error ?? "Erro ao salvar unidade.")
      return
    }
    setEditingId(null)
    load()
  }

  async function remove(u: Unit) {
    if (u.caseCount > 0) return
    if (!confirm(`Excluir a unidade "${u.identifier}"?`)) return
    setError(null)
    const res = await fetch(`${base}/${u.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? data.error ?? "Erro ao excluir unidade.")
      return
    }
    onCountChange(-1)
    load()
  }

  return (
    <div className="border-t border-divider bg-bone-50 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Unidades {!loading && `(${units.length})`}</Eyebrow>
        <Button
          variant="secondary"
          size="sm"
          icon="plus"
          onClick={() => {
            setShowForm((s) => !s)
            setForm(EMPTY_UNIT)
          }}
        >
          {showForm ? "Cancelar" : "Nova unidade"}
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-iron-600">{error}</p>}

      {showForm && (
        <form
          onSubmit={create}
          className="mb-4 grid gap-3 rounded-lg bg-surface p-4 shadow-hair md:grid-cols-3"
        >
          <Input
            label="Identificador"
            value={form.identifier}
            onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
            required
            placeholder="Ex.: 101"
          />
          <Input
            label="Torre / bloco"
            value={form.block}
            onChange={(e) => setForm((f) => ({ ...f, block: e.target.value }))}
            placeholder="Opcional — Ex.: A"
          />
          <Input
            label="Andar"
            value={form.floor}
            onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
            placeholder="Opcional"
          />
          <Input
            label="Proprietário"
            value={form.ownerName}
            onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            placeholder="Opcional"
          />
          <Input
            label="E-mail do proprietário"
            type="email"
            value={form.ownerEmail}
            onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
            placeholder="Opcional"
          />
          <Input
            label="Telefone"
            value={form.ownerPhone}
            onChange={(e) => setForm((f) => ({ ...f, ownerPhone: e.target.value }))}
            placeholder="Opcional"
          />
          <div className="flex items-end">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Criando…" : "Criar unidade"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-ink-400">Carregando unidades…</p>
      ) : units.length === 0 ? (
        <p className="text-sm text-ink-400">Nenhuma unidade cadastrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surface shadow-hair">
          <div className={`${COLS} border-b border-divider bg-bone-50 px-4 py-2`}>
            <Eyebrow>Unidade</Eyebrow>
            <Eyebrow>Bloco</Eyebrow>
            <Eyebrow>Andar</Eyebrow>
            <Eyebrow>Proprietário</Eyebrow>
            <Eyebrow>E-mail</Eyebrow>
            <Eyebrow>Ações</Eyebrow>
          </div>
          <div className="divide-y divide-divider">
            {units.map((u) =>
              editingId === u.id ? (
                <div key={u.id} className="grid gap-3 px-4 py-3 md:grid-cols-3">
                  <Input
                    label="Identificador"
                    value={editForm.identifier}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, identifier: e.target.value }))
                    }
                  />
                  <Input
                    label="Torre / bloco"
                    value={editForm.block}
                    onChange={(e) => setEditForm((f) => ({ ...f, block: e.target.value }))}
                  />
                  <Input
                    label="Andar"
                    value={editForm.floor}
                    onChange={(e) => setEditForm((f) => ({ ...f, floor: e.target.value }))}
                  />
                  <Input
                    label="Proprietário"
                    value={editForm.ownerName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, ownerName: e.target.value }))
                    }
                  />
                  <Input
                    label="E-mail do proprietário"
                    type="email"
                    value={editForm.ownerEmail}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, ownerEmail: e.target.value }))
                    }
                  />
                  <Input
                    label="Telefone"
                    value={editForm.ownerPhone}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, ownerPhone: e.target.value }))
                    }
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => saveEdit(u.id)}
                      disabled={saving}
                    >
                      Salvar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={u.id} className={`${COLS} px-4 py-3`}>
                  <span className="text-sm font-medium text-ink-900">{u.identifier}</span>
                  <span className="text-sm text-ink-600">{u.block ?? "—"}</span>
                  <span className="text-sm text-ink-600">{u.floor ?? "—"}</span>
                  <span className="text-sm text-ink-600">{u.ownerName ?? "—"}</span>
                  <span className="truncate text-xs text-ink-500">{u.ownerEmail ?? "—"}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(u.id)
                        setEditForm(toForm(u))
                      }}
                      className="text-xs font-medium text-azulejo-700 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(u)}
                      disabled={u.caseCount > 0}
                      title={
                        u.caseCount > 0
                          ? "Unidade com casos não pode ser excluída"
                          : "Excluir unidade"
                      }
                      className="text-xs font-medium text-iron-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
