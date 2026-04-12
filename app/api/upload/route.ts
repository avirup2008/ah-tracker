import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import sql from '@/lib/db'
import { parseFilename, getWeekSaturday } from '@/lib/parser'
import { format } from 'date-fns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const results = []

    for (const file of files) {
      const filename = file.name

      // Check for duplicate
      const existing = await sql`
        SELECT id, parsed FROM receipts WHERE filename = ${filename}
      `
      if (existing.length > 0) {
        results.push({ filename, status: 'duplicate', id: existing[0].id })
        continue
      }

      // Parse filename for metadata
      const meta = parseFilename(filename)
      if (!meta) {
        results.push({ filename, status: 'error', message: 'Could not parse filename' })
        continue
      }

      // Upload to Vercel Blob
      const buffer = Buffer.from(await file.arrayBuffer())
      const blob = await put(`receipts/${filename}`, buffer, {
        access: 'public',
        contentType: 'application/pdf',
      })

      // Calculate week Saturday
      const weekSat = getWeekSaturday(meta.date)

      // Insert receipt record (unparsed)
      const inserted = await sql`
        INSERT INTO receipts (
          filename, blob_url, store_id,
          receipt_date, receipt_time,
          year, month, week_saturday,
          parsed
        ) VALUES (
          ${filename},
          ${blob.url},
          ${meta.storeId},
          ${format(meta.date, 'yyyy-MM-dd')},
          ${meta.time},
          ${meta.date.getFullYear()},
          ${meta.date.getMonth() + 1},
          ${format(weekSat, 'yyyy-MM-dd')},
          false
        )
        RETURNING id
      `

      const receiptId = inserted[0].id
      results.push({ filename, status: 'uploaded', id: receiptId, blobUrl: blob.url })
    }

    // Trigger parsing for newly uploaded receipts
    const newIds = results
      .filter(r => r.status === 'uploaded')
      .map(r => r.id)

    if (newIds.length > 0) {
      // Fire-and-forget parse (non-blocking)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: newIds }),
      }).catch(console.error)
    }

    return NextResponse.json({
      uploaded: results.filter(r => r.status === 'uploaded').length,
      duplicates: results.filter(r => r.status === 'duplicate').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
