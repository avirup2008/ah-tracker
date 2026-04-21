import { NextRequest, NextResponse } from 'next/server'

import sql from '@/lib/db'
import { sanitizePantryInput } from '@/lib/pantry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await sql`
      SELECT *
      FROM pantry_items
      ORDER BY updated_at DESC, id DESC
    `

    return NextResponse.json({ items: rows })
  } catch (err) {
    console.error('Pantry fetch error:', err)
    return NextResponse.json({ error: 'Failed to load pantry' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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

    const existing = await sql`
      SELECT id
      FROM pantry_items
      WHERE normalized_name = ${item.normalized_name}
         OR family_key = ${item.family_key}
      LIMIT 1
    `

    if (existing.length > 0) {
      const updated = await sql`
        UPDATE pantry_items
        SET
          name = ${item.name},
          normalized_name = ${item.normalized_name},
          quantity_note = ${item.quantity_note},
          category = ${item.category},
          family_key = ${item.family_key},
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `
      return NextResponse.json(updated[0])
    }

    const inserted = await sql`
      INSERT INTO pantry_items (name, normalized_name, family_key, quantity_note, category)
      VALUES (
        ${item.name},
        ${item.normalized_name},
        ${item.family_key},
        ${item.quantity_note},
        ${item.category}
      )
      RETURNING *
    `

    return NextResponse.json(inserted[0], { status: 201 })
  } catch (err) {
    console.error('Pantry create error:', err)
    return NextResponse.json({ error: 'Failed to save pantry item' }, { status: 500 })
  }
}
