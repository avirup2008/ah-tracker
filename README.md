# AH Tracker 🛒

Albert Heijn grocery spending tracker for Beverhof, Beverwijk.
Analyses 116+ receipts, tracks inflation, detects waste, plans meals with AH ingredients.

---

## Stack

- **Framework**: Next.js 15 App Router
- **Database**: Vercel Postgres (Neon)
- **File Storage**: Vercel Blob
- **AI**: Google Gemini (categorisation, meal planning, deals)
- **Charts**: Recharts
- **Styling**: Tailwind CSS + custom CSS variables (Warm Analyst ↔ Midnight Carbon)

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd ah-tracker
npm install
```

### 2. Create Vercel project

```bash
npm i -g vercel
vercel login
vercel link   # create new project
```

### 3. Set up Vercel Postgres

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Storage → Create → Postgres
2. Name it `ah-tracker-db`
3. Connect to your project
4. Copy connection strings to `.env.local`

### 4. Set up Vercel Blob

1. Go to Vercel Dashboard → Storage → Create → Blob
2. Name it `ah-tracker-blob`
3. Copy `BLOB_READ_WRITE_TOKEN` to `.env.local`

### 5. Get Google AI Studio API key

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create API key → copy to `.env.local`

### 6. Set up environment variables

```bash
cp .env.local.example .env.local
# Fill in all 5 variables
```

Your `.env.local` should look like:
```
POSTGRES_URL="postgres://..."
POSTGRES_URL_NON_POOLING="postgres://..."
BLOB_READ_WRITE_TOKEN="vercel_blob_..."
GOOGLE_API_KEY="AIza..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 7. Run database migration

```bash
npm run db:migrate
```

This creates all tables and seeds the store location data.

### 8. Run locally to test

```bash
npm run dev
# Open http://localhost:3000
```

### 9. Deploy to Vercel

```bash
vercel --prod
```

Then add your environment variables to Vercel Dashboard → Project → Settings → Environment Variables.
Set `NEXT_PUBLIC_APP_URL` to your Vercel URL (e.g. `https://ah-tracker.vercel.app`).

### 10. Bulk upload your 116 receipts

```bash
# Install Python dependencies
pip3 install requests python-dotenv

# Run the uploader (point at your deployed URL)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app python3 scripts/bulk-upload.py
```

Then open your app → Receipts → "Parse All Pending" to trigger Gemini categorisation.

---

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Budget gauge, weekly spend chart, category breakdown, AI insights |
| **Receipts** | Upload new PDFs (drag & drop), view all parsed receipts |
| **Analysis A** | Category breakdown + spend anomaly detection |
| **Analysis B** | Brand switching — AH own brand vs A-brand cost |
| **Analysis C** | Waste predictor — perishables bought in small shops |
| **Analysis D** | Price seasonality — monthly price averages |
| **Analysis E** | Bonus deal tracking — your frequent deal items |
| **Analysis H** | Monthly budget forecast |
| **Meal Planner** | AI-generated meal plan with configurable lunch and dinner counts, recipe cards, shopping list |
| **Deals** | Current AH Bonus deals (Gemini web grounding, 24h cache) |
| **Theme Toggle** | Warm Analyst (light) ↔ Midnight Carbon (dark) |

---

## Parser Rules

```
True grocery spend = TOTAAL - KOOPZEGELS - STATIEGELD

Week = Saturday to Friday (Saturday-aligned)
Budget = €90/week
```

---

## Adding new receipts

1. Export PDF from the AH app
2. Open your app → Receipts → drag & drop the PDF
3. It uploads, parses, and categorises automatically

---

## Project structure

```
ah-tracker/
├── app/
│   ├── api/           API routes (upload, parse, receipts, analysis, deals, meal-plan)
│   ├── analysis/      Analysis page (features A-H)
│   ├── deals/         AH Deals browser
│   ├── meal-planner/  Meal planning + shopping list
│   ├── receipts/      Upload + receipt list
│   └── page.tsx       Dashboard
├── components/
│   ├── dashboard/     BudgetCard, SpendChart, CategoryBreakdown, etc.
│   ├── layout/        Header, ThemeToggle, ThemeProvider
│   └── ui/            Shared UI components
├── lib/
│   ├── ai.ts          Gemini and AI integration helpers
│   ├── db.ts          Postgres client + types
│   ├── parser.ts      AH receipt text parser
│   └── utils.ts       Formatters and helpers
├── drizzle/
│   └── schema.sql     Full database schema
└── scripts/
    ├── bulk-upload.py  Initial bulk upload (run once)
    └── migrate.mjs     DB migration runner
```
