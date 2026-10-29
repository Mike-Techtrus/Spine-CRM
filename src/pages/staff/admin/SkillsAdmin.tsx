import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  countSkillUsage,
  createSkill,
  createSkillCategory,
  deleteSkill,
  deleteSkillCategory,
  listSkillCategories,
  listSkills,
  updateSkill,
  updateSkillCategory,
} from '../../../lib/api'
import type { Skill, SkillCategory } from '../../../lib/types'
import { Button, Card, ErrorText, Input, Label, SearchInput, Select } from '../../../components/ui'
import AdminTabs from './AdminTabs'

function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('skills_category_name_key')) return 'A skill with that name already exists in that category.'
  if (message.includes('skill_categories_name_key')) return 'A category with that name already exists.'
  if (message.includes('violates foreign key constraint')) return 'It’s still in use, so it can’t be deleted.'
  return message
}

const emptySkill = { category_id: '', name: '', description: '' }

export default function SkillsAdmin() {
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [newSkill, setNewSkill] = useState(emptySkill)
  const [editing, setEditing] = useState<Skill | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  async function refresh() {
    const [c, s, u] = await Promise.all([listSkillCategories(), listSkills(), countSkillUsage()])
    setCategories(c)
    setSkills(s)
    setUsage(u)
  }

  useEffect(() => {
    refresh().catch((err) => setError(friendlyError(err, 'Failed to load.')))
  }, [])

  // Wraps each change so errors show on the page and the lists reload.
  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      setError(friendlyError(err, fallback))
      return false
    }
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    const name = newCategory.trim()
    if (!name) return
    const nextOrder = Math.max(0, ...categories.map((c) => c.sort_order)) + 1
    if (await run(() => createSkillCategory(name, nextOrder), 'Failed to add category.')) setNewCategory('')
  }

  function renameCategory(c: SkillCategory) {
    const name = window.prompt('Rename category', c.name)?.trim()
    if (!name || name === c.name) return
    run(() => updateSkillCategory(c.id, { name }), 'Failed to rename category.')
  }

  function removeCategory(c: SkillCategory) {
    if (!window.confirm(`Delete the "${c.name}" category?`)) return
    run(() => deleteSkillCategory(c.id), 'Failed to delete category.')
  }

  async function handleAddSkill(e: FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        createSkill({
          category_id: newSkill.category_id,
          name: newSkill.name.trim(),
          description: newSkill.description.trim() || null,
        }),
      'Failed to add skill.',
    )
    // Keep the category picked so several skills can be added in a row.
    if (ok) setNewSkill({ ...emptySkill, category_id: newSkill.category_id })
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const ok = await run(
      () =>
        updateSkill(editing.id, {
          category_id: editing.category_id,
          name: editing.name.trim(),
          description: editing.description?.trim() || null,
        }),
      'Failed to save skill.',
    )
    if (ok) setEditing(null)
  }

  function removeSkill(s: Skill) {
    if (!window.confirm(`Delete "${s.name}" from the skills database?`)) return
    run(() => deleteSkill(s.id), 'Failed to delete skill.')
  }

  const categoryName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories])
  const skillCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of skills) counts[s.category_id] = (counts[s.category_id] ?? 0) + 1
    return counts
  }, [skills])

  const visibleSkills = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order = Object.fromEntries(categories.map((c, i) => [c.id, i]))
    return skills
      .filter((s) => showInactive || s.is_active)
      .filter((s) => !categoryFilter || s.category_id === categoryFilter)
      .filter((s) => !q || `${s.name} ${s.description ?? ''} ${categoryName[s.category_id] ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (order[a.category_id] ?? 0) - (order[b.category_id] ?? 0) || a.name.localeCompare(b.name))
  }, [skills, categories, categoryName, query, categoryFilter, showInactive])

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · Skills</h1>
      <AdminTabs />

      <p className="mb-6 text-sm text-text-muted">
        The master list of skills, soft skills and certifications. Add them to a contractor from their
        profile (Contractors → click a name).
      </p>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Categories */}
        <Card className="lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-text">Categories</h2>
          <ul className="mb-4 divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-text">
                  {c.name}
                  <span className="ml-2 text-xs text-text-faint">{skillCountByCategory[c.id] ?? 0}</span>
                </span>
                <span className="flex gap-3">
                  <button onClick={() => renameCategory(c)} className="text-xs text-text-muted hover:text-text">
                    Rename
                  </button>
                  {!skillCountByCategory[c.id] && (
                    <button onClick={() => removeCategory(c)} className="text-xs text-text-muted hover:text-danger">
                      Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <Input placeholder="New category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!newCategory.trim()}>
              Add
            </Button>
          </form>
        </Card>

        {/* Add / edit skill */}
        <Card className="lg:col-span-2">
          {editing ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <h2 className="text-sm font-semibold text-text">Edit skill</h2>
              <SkillFields
                categories={categories}
                value={{ ...editing, description: editing.description ?? '' }}
                onChange={(v) => setEditing({ ...editing, ...v })}
              />
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddSkill} className="space-y-4">
              <h2 className="text-sm font-semibold text-text">Add skill</h2>
              <SkillFields
                categories={categories}
                value={newSkill}
                onChange={(v) => setNewSkill({ ...newSkill, ...v })}
              />
              <Button type="submit">Add skill</Button>
            </form>
          )}
        </Card>
      </div>

      {/* Skills list */}
      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search skills…" className="max-w-sm flex-1" />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-auto"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
            <tr>
              <th className="px-4 py-2">Skill</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Contractors</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleSkills.length > 0 ? (
              visibleSkills.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <p className="text-text">{s.name}</p>
                    {s.description && <p className="text-xs text-text-muted">{s.description}</p>}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{categoryName[s.category_id]}</td>
                  <td className="px-4 py-2 text-text-muted">{usage[s.id] ?? 0}</td>
                  <td className="px-4 py-2 text-text-muted">{s.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="flex justify-end gap-3 text-xs">
                      <button onClick={() => setEditing(s)} className="text-accent hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => run(() => updateSkill(s.id, { is_active: !s.is_active }), 'Failed to update skill.')}
                        className="text-text-muted hover:text-text"
                      >
                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      {!usage[s.id] && (
                        <button onClick={() => removeSkill(s)} className="text-text-muted hover:text-danger">
                          Delete
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-muted">
                  {skills.length === 0 ? 'No skills yet — add the first one above.' : 'No skills match.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Skills already on a contractor’s profile can’t be deleted — deactivate them instead. They stay on
        existing profiles but can’t be added to new ones.
      </p>
    </div>
  )
}

function SkillFields({
  categories,
  value,
  onChange,
}: {
  categories: SkillCategory[]
  value: { category_id: string; name: string; description: string }
  onChange: (v: Partial<{ category_id: string; name: string; description: string }>) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <Label>Category</Label>
        <Select required value={value.category_id} onChange={(e) => onChange({ category_id: e.target.value })}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Name</Label>
        <Input required value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label>Description (optional)</Label>
        <Input value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
    </div>
  )
}
