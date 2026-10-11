# Pip · HackMate

An assistant-first hackathon companion: introduce your team, attach the event rules, and talk through a realistic project and game plan. Pip has 30 SVG gestures and can grow extra arms for multitasking.

## Run locally

Use Node.js 22.13 or later.

```sh
npm install
cp .env.example .env
npm run dev
```

On Windows, use `Copy-Item .env.example .env` instead of `cp`.
Add your NVIDIA and ElevenLabs keys to `.env`. Open http://localhost:5180. Actual keys are deliberately excluded from Git.
NVIDIA is the default brain. The separate Gemini adapter can be configured later. ElevenLabs handles microphone transcription and Chris's expressive voice; the configured voice model is V4 Turbo. Account availability and quotas depend on your provider accounts.

## How it works

- `app/page.tsx` runs the conversation and applies validated changes to the workspace.
- `lib/hackmate/intake.ts` asks for the event, team, prior experience, goal, official documents, and available time. Unknown details require an explicit answer.
- `lib/hackmate/team-introduction.ts` immediately saves common self-introductions. More complex speech goes to the AI and must return real operations.
- `lib/hackmate/read-pdf.ts` renders image-only pages and runs local Tesseract OCR. `pdf-text.ts` preserves page sections; `read-documents.ts` keeps readable files even when another file fails. OCR workers and English language data ship under `public/ocr`.
- `lib/hackmate/ai.ts` calls the selected provider and validates replies. An unsupported claim that a change was saved is rejected.
- `lib/hackmate/operations.ts` applies a whole action batch atomically.
- `hooks/use-companion-voice.ts` records, transcribes, and speaks. Safe conversational replies begin speaking their first completed sentence while the rest arrives; later speech queues without interrupting it. Changes are confirmed after validation.
- `lib/hackmate/diagnostics.ts` keeps the last 500 metadata events in a separate local IndexedDB database, including across workspace resets. Export them under Settings. Logs exclude conversation text, attachments, audio, and keys. Server request IDs connect browser events to server console logs.

Team and plan data persist in the browser. Official materials guide recommendations; public search excerpts and previous projects are inspiration, not proof of this year's rules.

## Check it

```sh
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

There are 80 automated checks covering actions, intake, streaming, voice lifecycle, and the missing-team regression. Provider and microphone tests use synthetic data or mocks. Actual microphone use requires browser permission.

See [START-HERE.md](START-HERE.md) for a beginner-friendly walkthrough and [MOTION-CATALOG.md](MOTION-CATALOG.md) for every gesture.

GitHub and Discord account integrations, shared multi-user state, and the desktop floating companion are future work. PDFs use embedded text when available and local OCR for image-only pages, including with the NVIDIA provider. Each file may be up to 50 MB; PDFs are limited to 80 pages and 100,000 extracted characters. Very small or stylized lettering may still be imperfect.
