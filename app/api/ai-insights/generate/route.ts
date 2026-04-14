import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json() as { prompt: string }
    if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 })

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      const parsed = JSON.parse(err)
      const msg = parsed?.error?.message ?? err.slice(0, 200)
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return NextResponse.json({ text })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
