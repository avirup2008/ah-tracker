#!/usr/bin/env python3
"""
AH Tracker — Bulk Receipt Uploader
===================================
Uploads all PDF receipts from your local folder to the deployed Vercel app.
Run ONCE after deployment to seed the database with your 116 receipts.

Usage:
    python3 scripts/bulk-upload.py

Requirements:
    pip3 install requests python-dotenv
"""

import os
import sys
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load from .env.local if present
load_dotenv(PROJECT_ROOT / ".env.local")

# Receipts folder, defaulting to a local Receipts directory in the repo
RECEIPTS_DIR = Path(os.getenv("RECEIPTS_DIR", str(PROJECT_ROOT / "Receipts")))

# Your deployed Vercel URL (or localhost:3000 for local testing)
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

# How many PDFs to upload per batch (keep low to avoid timeouts)
BATCH_SIZE = 5

# Delay between batches (seconds) to avoid hammering the API
BATCH_DELAY = 2

# ── Helpers ────────────────────────────────────────────────────

def find_pdfs(base_dir: Path) -> list[Path]:
    """Recursively find all PDF receipt files, sorted by date."""
    pdfs = []
    for pdf in base_dir.rglob("AH_kassabon_*.pdf"):
        pdfs.append(pdf)
    return sorted(pdfs)

def upload_batch(files: list[Path], session: requests.Session) -> dict:
    """Upload a batch of PDFs to /api/upload."""
    url = f"{APP_URL}/api/upload"
    file_handles = []
    try:
        for pdf in files:
            f = open(pdf, "rb")
            file_handles.append(f)

        multipart = [("files", (pdf.name, fh, "application/pdf"))
                     for pdf, fh in zip(files, file_handles)]

        resp = session.post(url, files=multipart, timeout=120)
        resp.raise_for_status()
        return resp.json()
    finally:
        for fh in file_handles:
            fh.close()

def format_result(result: dict) -> str:
    return (f"✅ {result.get('uploaded', 0)} uploaded  "
            f"🔁 {result.get('duplicates', 0)} duplicates  "
            f"❌ {result.get('errors', 0)} errors")

# ── Main ────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("AH Tracker — Bulk Receipt Uploader")
    print("=" * 60)

    # Validate receipts directory
    if not RECEIPTS_DIR.exists():
        print(f"\n❌ Receipts directory not found:\n   {RECEIPTS_DIR}")
        print("\nSet the correct path with:")
        print("   export RECEIPTS_DIR='/your/path/to/Receipts'")
        sys.exit(1)

    # Find all PDFs
    pdfs = find_pdfs(RECEIPTS_DIR)
    if not pdfs:
        print(f"\n❌ No AH_kassabon_*.pdf files found in:\n   {RECEIPTS_DIR}")
        sys.exit(1)

    print(f"\n📂 Receipts directory: {RECEIPTS_DIR}")
    print(f"📄 Found {len(pdfs)} PDF receipts")
    print(f"🌐 Target URL: {APP_URL}")
    print(f"📦 Batch size: {BATCH_SIZE} files per request")

    # Quick connectivity check
    print(f"\n⏳ Checking app connectivity...")
    try:
        resp = requests.get(f"{APP_URL}/api/receipts?limit=1", timeout=10)
        if resp.status_code == 200:
            existing = resp.json().get("total", 0)
            print(f"✅ App reachable — {existing} receipts already in DB")
        else:
            print(f"⚠️  App returned {resp.status_code} — continuing anyway")
    except Exception as e:
        print(f"⚠️  Could not reach app: {e}")
        print("   Make sure the app is running and APP_URL is correct.")
        if not input("   Continue anyway? (y/N): ").lower().startswith("y"):
            sys.exit(1)

    # Confirm before starting
    print(f"\n🚀 Ready to upload {len(pdfs)} receipts in {len(pdfs) // BATCH_SIZE + 1} batches.")
    if not input("   Start? (y/N): ").lower().startswith("y"):
        print("Aborted.")
        sys.exit(0)

    # Upload in batches
    session = requests.Session()
    total_uploaded   = 0
    total_duplicates = 0
    total_errors     = 0
    failed_files     = []

    batches = [pdfs[i:i+BATCH_SIZE] for i in range(0, len(pdfs), BATCH_SIZE)]
    total_batches = len(batches)

    print()
    for batch_num, batch in enumerate(batches, 1):
        filenames = [f.name for f in batch]
        print(f"Batch {batch_num}/{total_batches}: {filenames[0]} ... {filenames[-1]}")

        try:
            result = upload_batch(batch, session)
            total_uploaded   += result.get("uploaded",   0)
            total_duplicates += result.get("duplicates", 0)
            total_errors     += result.get("errors",     0)

            # Track individual failures
            for r in result.get("results", []):
                if r.get("status") == "error":
                    failed_files.append((r.get("filename"), r.get("message")))

            print(f"  {format_result(result)}")

        except requests.exceptions.Timeout:
            print(f"  ⏱️  Timeout — will retry batch individually")
            # Retry files individually
            for pdf in batch:
                try:
                    result = upload_batch([pdf], session)
                    total_uploaded   += result.get("uploaded",   0)
                    total_duplicates += result.get("duplicates", 0)
                    total_errors     += result.get("errors",     0)
                    print(f"    {pdf.name}: {format_result(result)}")
                    time.sleep(0.5)
                except Exception as e2:
                    total_errors += 1
                    failed_files.append((pdf.name, str(e2)))
                    print(f"    ❌ {pdf.name}: {e2}")

        except Exception as e:
            total_errors += len(batch)
            for pdf in batch:
                failed_files.append((pdf.name, str(e)))
            print(f"  ❌ Batch failed: {e}")

        if batch_num < total_batches:
            time.sleep(BATCH_DELAY)

    # ── Summary ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("UPLOAD COMPLETE")
    print("=" * 60)
    print(f"  ✅ Uploaded:    {total_uploaded}")
    print(f"  🔁 Duplicates: {total_duplicates}")
    print(f"  ❌ Errors:     {total_errors}")

    if failed_files:
        print(f"\nFailed files:")
        for fname, msg in failed_files:
            print(f"  • {fname}: {msg}")

    print(f"""
Next steps:
  1. Open {APP_URL}/receipts in your browser
  2. Click "Parse All Pending" to trigger AI categorisation
     (this may take a few minutes for 116 receipts)
  3. Refresh the Dashboard to see your data

Note: Parsing runs in the background via the API.
      Each receipt requires a Gemini API call for categorisation.
""")

if __name__ == "__main__":
    main()
