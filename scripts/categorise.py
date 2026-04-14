#!/usr/bin/env python3
"""
Categorise all receipt items using Gemini directly.
Reads raw_text from DB, calls Gemini, writes categories back.
Rate limit: 15 RPM free tier → 4s delay between calls.
"""
import os, time, json, re, psycopg2
import google.generativeai as genai

# ── Load env ──────────────────────────────────────────────────
env = {}
for line in open('/Users/avi/Downloads/Claude/Projects/Projects/ah-tracker/.env.local'):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"')

genai.configure(api_key=env['GOOGLE_API_KEY'])
model = genai.GenerativeModel('gemini-2.5-flash-lite')

conn = psycopg2.connect(env.get('POSTGRES_URL_NON_POOLING') or env.get('DATABASE_URL_UNPOOLED'))
cur = conn.cursor()

CATEGORIES = """
FOOD (count toward budget):
- Vlees & Vis (Meat & Fish)
- Zuivel & Eieren (Dairy & Eggs)
- Groente & Fruit (Produce)
- Brood & Bakkerij (Bakery)
- Pasta, Rijst & Granen (Pasta, Rice & Grains)
- Sauzen & Kruiden (Sauces, Spices & Condiments)
- Maaltijden kant-en-klaar (Ready meals)
- Snacks & Zoetwaren (Snacks & Sweets)
- Dranken (Non-alcoholic drinks)
- Bier & Wijn (Alcohol)
NON-FOOD (excluded from budget):
- Huishoud (Household: cleaning, kitchen paper)
- Persoonlijke verzorging (Personal care & pharmacy)
- Overig non-food (Other non-food)
""".strip()

def categorise_items(items):
    """Send list of raw item names to Gemini, return categorised results."""
    item_list = '\n'.join(f'{i}: {name}' for i, name in enumerate(items))
    prompt = f"""You are an Albert Heijn product expert. Categorise each abbreviated Dutch grocery item.

{CATEGORIES}

Rules:
- cleanName: "Dutch name (English translation)" e.g. "Halfvolle melk (semi-skimmed milk)"
- Non-food: isNonFood=true, btwRate=21
- Food: btwRate=9. Alcohol: btwRate=21 but category=Bier & Wijn
- AH = Albert Heijn own brand. HV = halfvolle. SCHARREL = free-range
- HIPRO = high protein drink. STARB = Starbucks

Items (index: raw_name):
{item_list}

Respond ONLY with a valid JSON array, no markdown:
[{{"index":0,"cleanName":"...","category":"...","isNonFood":false,"btwRate":9}}]"""

    resp = model.generate_content(prompt)
    text = resp.text.strip()
    # Strip markdown code fences if present
    text = re.sub(r'^```json?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return json.loads(text)


# ── Get all receipts with uncategorised items ─────────────────
cur.execute("""
    SELECT DISTINCT r.id, r.filename
    FROM receipts r
    JOIN receipt_items ri ON ri.receipt_id = r.id
    WHERE ri.category IS NULL
      AND ri.is_statiegeld = false
      AND ri.is_koopzegel  = false
    ORDER BY r.id
""")
receipts = cur.fetchall()
print(f'Receipts needing categorisation: {len(receipts)}')
print()

ok = failed = skipped = 0

for idx, (receipt_id, filename) in enumerate(receipts, 1):
    # Get items for this receipt
    cur.execute("""
        SELECT id, raw_name FROM receipt_items
        WHERE receipt_id = %s
          AND category IS NULL
          AND is_statiegeld = false
          AND is_koopzegel  = false
    """, (receipt_id,))
    items = cur.fetchall()

    if not items:
        skipped += 1
        continue

    raw_names = [row[1] for row in items]
    item_ids  = [row[0] for row in items]

    try:
        results = categorise_items(raw_names)

        updated = 0
        for r in results:
            i = r.get('index', -1)
            if i < 0 or i >= len(item_ids):
                continue
            cur.execute("""
                UPDATE receipt_items SET
                    clean_name  = %s,
                    category    = %s,
                    is_non_food = %s,
                    btw_rate    = %s
                WHERE id = %s
            """, (
                r.get('cleanName'),
                r.get('category'),
                r.get('isNonFood', False),
                r.get('btwRate', 9),
                item_ids[i]
            ))
            updated += 1

        conn.commit()
        ok += 1
        print(f'{idx}/{len(receipts)} ✅ {filename[:45]} — {updated}/{len(items)} items categorised')

    except Exception as e:
        conn.rollback()
        failed += 1
        print(f'{idx}/{len(receipts)} ❌ {filename[:45]} — {e}')

    # 4 second delay → stays under 15 RPM free tier limit
    if idx < len(receipts):
        time.sleep(4)

print(f'\n✅ {ok} receipts done  ⚠️  {skipped} skipped  ❌ {failed} failed')
conn.close()
