import { normalizeItemName } from './normalization.ts'

export interface PantryInput {
  name?: string | null
  quantity_note?: string | null
  category?: string | null
}

export interface PantryItemRecord {
  id: number
  name: string
  normalized_name: string
  quantity_note: string | null
  category: string | null
  created_at: string
  updated_at: string
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function sanitizePantryInput(input: PantryInput) {
  const name = parseOptionalString(input.name)
  if (!name) return null

  return {
    name,
    normalized_name: normalizeItemName(name),
    quantity_note: parseOptionalString(input.quantity_note),
    category: parseOptionalString(input.category),
  }
}
