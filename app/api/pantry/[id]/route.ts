import { NextRequest, NextResponse } from 'next/server'

import sql from '@/lib/db'
import { sanitizePantryInput } from '@/lib/pantry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parsePantryId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const pantryId = parsePantryId(params.id)
  if (!pantryId) {
    return NextResponse.json({ error: 'Invalid pantry item id' }, { status: 400 })
  }

  try {
    const body = await req.json() as {
      name?: string | null
      quantity_note?: string | null
      category?: string | null
    }

    const item = sanitizePantryInput(body)
    if (!item) {
      return NextResponse.json({ error: 'Pantry item name is required' }, { status: 400 })
    }

    const rows = await sql`
      UPDATE pantry_items
      SET
        name = ${item.name},
        normalized_name = ${item.normalized_name},
        family_key = ${item.family_key},
        quantity_note = ${item.quantity_note},
        category = ${item.category},
        updated_at = NOW()
      WHERE id = ${pantryId}
      RETURNING *
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Pantry item not found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('Pantry update error:', err)
    return NextResponse.json({ error: 'Failed to update pantry item' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const pantryId = parsePantryId(params.id)
  if (!pantryId) {
    return NextResponse.json({ error: 'Invalid pantry item id' }, { status: 400 })
  }

  try {
    await sql`DELETE FROM pantry_items WHERE id = ${pantryId}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Pantry delete error:', err)
    return NextResponse.json({ error: 'Failed to delete pantry item' }, { status: 500 })
  }
}
