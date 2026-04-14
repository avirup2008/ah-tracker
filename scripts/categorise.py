#!/usr/bin/env python3
"""
Categorise receipt items using Gemini — batched to stay within 20 RPD free tier.
Sends up to 10 receipts worth of items per API call = ~11 calls for 109 receipts.
"""
import os, time, json, re, psycopg2
from google import genai

# ── Load env ──────────────────────────────────────────────────
env = {}
for line in open('/Users/avi/Downloads/Claude/Projects/Projects/ah-tracker/.env.local'):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"')

client = genai.Client(api_key=env['GOOGLE_API_KEY'])

conn = psycopg2.connect(env.get('POSTGRES_URL_NON_POOLING') or env.get('DATABASE_URL_UNPOOLED'))
cur = conn.cursor()

CATEGORIES = """
FOOD: Vlees & Vis | Zuivel & Eieren | Groente & Fruit | Brood & Bakkerij |
Pasta Rijst & Granen | Sauzen & Kruiden | Maaltijden kant-en-klaar |
Snacks & Zoetwaren | Dranken | Bier & Wijn
NON-FOOD (isNonFood=true, btwRate=21): Huishoud | Persoonlijke verzorging | Overig non-food
FOOD btwRate=9, except Bier & Wijn btwRate=21
"""

def categorise_batch(items_by_receipt):
    """
    items_by_receipt: list of (receipt_id, [(item_id, raw_name), ...])
    Returns: {item_id: {cleanName, category, isNonFood, btwRate}}
    """
    # Build flat list with global index
    flat = []
    for rid, items in items_by_receipt:
        for iid, name in items:
            flat.append((iid, name))

    item_list = '\n'.join(f'{i}: {name}' for i, (iid, name) in enumerate(flat))

    prompt = f"""Categorise these Albert Heijn receipt items. AH = own brand. HV = halfvolle. SCHARREL = free-range.

Categories: {CATEGORIES}

Items:
{item_list}

Respond ONLY with a JSON array, no markdown:
[{{"index":0,"cleanName":"Dutch name (English)","category":"...","isNonFood":false,"btwRate":9}}]"""

    resp = client.models.generate_content(
        model='gemini-2.5-flash-lite',
        contents=prompt
    )
    text = resp.text.strip()
    text = re.sub(r'^```json?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    results = json.loads(text)

    out = {}
    for r in results:
        i = r.get('index', -1)
        if 0 <= i < len(flat):
            iid = flat[i][0]
            out[iid] = r
    return out

# ── Get all uncategorised items grouped by receipt ────────────
cur.execute("""
    SELECT r.id, r.filename, ri.id, ri.raw_name
    FROM receipts r
    JOIN receipt_items ri ON ri.receipt_id = r.id
    WHERE ri.category IS NULL
      AND ri.is_statiegeld = false
      AND ri.is_koopzegel  = false
      AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
    ORDER BY r.id, ri.id
""")
rows = cur.fetchall()

# Group by receipt
from collections import defaultdict
receipts_map = defaultdict(list)
filenames = {}
for rid, fname, iid, rname in rows:
    receipts_map[rid].append((iid, rname))
    filenames[rid] = fname

receipt_ids = list(receipts_map.keys())
total_items = sum(len(v) for v in receipts_map.values())
print(f'Receipts needing categories: {len(receipt_ids)}')
print(f'Total items: {total_items}')

# ── Batch: 10 receipts per API call ───────────────────────────
BATCH_SIZE = 10
batches = [receipt_ids[i:i+BATCH_SIZE] for i in range(0, len(receipt_ids), BATCH_SIZE)]
print(f'Batches: {len(batches)} (≤{BATCH_SIZE} receipts each) — well within 20 RPD\n')

ok_items = 0
failed_batches = 0

for b_idx, batch_rids in enumerate(batches, 1):
    items_by_receipt = [(rid, receipts_map[rid]) for rid in batch_rids]
    total_in_batch = sum(len(items) for _, items in items_by_receipt)
    fnames = ', '.join(filenames[rid][:25] for rid in batch_rids[:3])
    print(f'Batch {b_idx}/{len(batches)}: {len(batch_rids)} receipts, {total_in_batch} items ({fnames}...)')

    try:
        results = categorise_batch(items_by_receipt)

        for iid, r in results.items():
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
                iid
            ))
        conn.commit()
        ok_items += len(results)
        print(f'  ✅ {len(results)}/{total_in_batch} items categorised')

    except Exception as e:
        conn.rollback()
        failed_batches += 1
        print(f'  ❌ {e}')

    # 5s delay between batches (well under 5 RPM limit)
    if b_idx < len(batches):
        time.sleep(5)

print(f'\n✅ Done — {ok_items} items categorised across {len(batches)-failed_batches} batches')
if failed_batches:
    print(f'⚠️  {failed_batches} batches failed — re-run to retry')
conn.close()
