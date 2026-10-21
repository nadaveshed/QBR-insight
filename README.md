# QBR Insight

Upload a QBR report as a PDF. The system extracts the required business information with an LLM, checks every value against the source text, flags anything missing or uncertain, and saves the result in PostgreSQL. A small React UI shows the results next to their sources.

How it works and why it was built this way: [ARCHITECTURE.md](ARCHITECTURE.md).

Hebrew presentation guide for a 30–45 minute demo and code walkthrough: [PRESENTATION.he.md](PRESENTATION.he.md).

## Run

Requirements: Node.js 24+, Docker Desktop, and a DeepSeek API key.

```powershell
npm ci
npm run infra:up        # PostgreSQL (port 55432) + Redis (port 56379)
```

Create `server/.env` from `server/.env.example` and set the key:

```dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_MODEL=deepseek-flash
```

```powershell
npm run db:migrate
npm run dev             # API + worker + UI
```

Open **http://127.0.0.1:5173** and upload the sample PDFs from `data/raw/`. Each upload triggers one model call. If the key is missing, the run fails with a clear message. Add the key, restart, and click **Retry processing**.

`npm run infra:down` stops the containers and keeps their data.

## Tests

```powershell
npm run build
npm test                  # unit tests
npm run test:integration  # needs the containers; stop `npm run dev` first
npm run test:ui           # Playwright; stop `npm run dev` first
```

- **Unit:** PDF parsing of the six samples, schema rules, evidence checks, dates, numbers and conflicts.
- **Integration:** real HTTP, Redis, PostgreSQL and PDF parsing, with a fake LLM. Covers saving, duplicates, export, retries and failures.
- **UI:** run `npx playwright install chromium` once if the browser is missing.

None of these call the real model. To measure real extraction quality on the six samples (6 paid model calls):

```powershell
npm run evaluate                                   # all samples
npm run evaluate -- --file <PDF filename>          # one sample
npm run evaluate -- --offline <evaluation folder>  # recheck saved results, no model calls
```

Results are saved to `data/evaluations/<timestamp>/`. The command fails if any expected check fails.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/documents` | Upload a PDF (form field `file`) |
| GET | `/api/documents?search=` | List and search by filename, customer or period |
| GET | `/api/documents/:id` | Result, source pages and review findings |
| GET | `/api/documents/:id/export` | Download the result as JSON |
| POST | `/api/documents/:id/retry` | Retry a failed run |
| GET | `/api/health`, `/api/ready` | Liveness; database, queue and API key status |

```powershell
curl.exe -F "file=@data/raw/01_Northwind_Technologies_Q2_2026.pdf" http://127.0.0.1:3001/api/documents
```

## Assumptions

- **Text-based PDFs only.** There is no OCR. Image-only documents are rejected. Pages with graphics and little text are kept and flagged for manual review.
- **Missing stays missing.** The system never guesses a value. It does not infer a year from a meeting date, pick a locale for `01/08/26`, or turn "July" into July 1.
- **Size limits:** 10 MB, 50 pages and 80,000 characters. Larger documents are rejected, not truncated.
- **Local, single-user POC.** No authentication. Document text is sent to DeepSeek.
- **Development samples only.** The six samples were used during development, so passing them does not prove accuracy on new reports.
