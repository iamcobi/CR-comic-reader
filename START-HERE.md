# Learn HackMate by talking to Pip

Pip is a browser assistant with a black-and-white SVG character, 30 action gestures, NVIDIA reasoning, and Chris’s ElevenLabs V4 Turbo voice. New workspaces start empty. The app gathers context through conversation instead of an editable context dashboard.

## Start locally

On Windows, install Node.js 22.13 or newer, extract the GitHub ZIP, and double-click **START-PIP.bat** in this folder. It installs dependencies on the first run, creates `.env` if needed, starts the server, and opens your browser when ready.

Add your own NVIDIA and ElevenLabs API keys to `.env`, save it, and restart the launcher for live replies and voice. You can explore Demo mode in Settings without keys. Keep the server window open and press Ctrl+C to stop. Never overwrite an existing `.env` or share its keys.

For terminal setup on any supported computer:

```sh
npm install
# First installation only: copy .env.example to .env and add your own keys.
npm run dev
```

Open **http://127.0.0.1:5173/**. See [README.md](README.md) for download steps and troubleshooting.

## Start a hackathon

Click **New hackathon**, or **Reset everything & start fresh** in Settings. This clears the local team, documents, project ideas, selected project, tasks, and conversation. Server API keys stay configured.

Pip asks for:

1. The hackathon name, with location/date if known.
2. Teammate names, coding skills, and experience levels, including your own.
3. What worked or went wrong at previous hackathons, or whether this is your first.
4. A problem, project interest, or goal.
5. The actual event brief, rules, and sponsor materials.
6. Available build hours.

Pip asks before recommending projects. If a detail is unavailable, say “I don’t know,” “I’m not sure,” or “I don’t have that.” It records the uncertainty. It does not turn sample teammates or sample rules into real context.

You can describe the team naturally: “I’m Collins, I know React, and I’m a beginner. Alex knows Python and is intermediate. That’s everyone.” NVIDIA extracts the supplied facts. A compact local format also works: `Collins | React | beginner; Alex | Python | intermediate`.

**Our team** lets you add, edit, and delete people directly. Unknown skills and levels can be stated explicitly. Deleting someone keeps their tasks and makes them unassigned. Once everyone is included, say “Team is ready” or use that button in the team panel.

## Documents and research

Use the paperclip to attach a readable PDF, TXT, Markdown, or CSV, or paste the brief into the conversation when Pip asks. PDF text is extracted in the browser before NVIDIA receives it. Image-only/scanned pages use local OCR automatically. The worker renders each page and reads the words in its image; it does not upload the original PDF to an OCR service. Pip shows page progress and keeps page labels for citations. If one file fails, other readable files in the batch are still saved. Each original file can be up to 50 MB. PDFs are limited to 80 pages and 100,000 extracted characters; combined extracted text and image content remains limited to 8 MB.

After learning the public event name, Pip searches for official event sources and previous hackathon project leads. Only the event name goes into the public search query. Research links are saved with the workspace. Search excerpts and old event pages are inspiration, not verified current rules; the official materials you supply remain necessary unless you explicitly say you do not have them.

Once intake finishes, ask for project ideas. Selecting a suggestion is an explicit action. **The plan** only opens your saved plan: it does not select a project, generate a plan, or speak an inferred choice. To generate tasks, choose a project and ask “Make a game plan.” Review the proposal before using it.

## Talk and listen

Tap the microphone, allow microphone access, speak, then tap again to send. Recording ends automatically after 30 seconds. ElevenLabs Scribe transcribes the audio; NVIDIA receives the transcript. Microphone use automatically turns spoken replies on. Stop speaking interrupts Pip. Turning Voice off cancels unfinished capture and playback.

Chris uses `eleven_v4_turbo`, the real-time V4 model. The server adds controlled tags such as `[curious]`, `[excited]`, and `[warmly]`. These guide delivery and are not shown as chat text. Voice input audio stays in app memory rather than an audio history, but it is sent to ElevenLabs for transcription. The local transcript is saved in the conversation.

Basic setup answers and team controls respond locally without waiting for AI. NVIDIA chat text streams progressively. Complex ideas and plans still need a complete, validated response. Speed varies with provider/network load. A malformed streamed response gets one constrained retry, and no workspace change is applied until validation passes.

## Understand the main code

`lib/hackmate/intake.ts` contains the questions and the order in which Pip asks them. `stage` means the current question. `advance()` moves to the next question. `skipped` records information the user explicitly does not know. `freshWorkspace()` creates a clean workspace, so no fictional teammates, rules, or tasks appear in a new hackathon.

`app/page.tsx` controls the conversation and panels. React state is simply the information the screen remembers. `send()` first handles intake, then chooses chat, ideas, or plan. `resetWorkspace()` cancels old requests and clears local workspace data. A session counter prevents a reply from an old hackathon appearing after reset.

`app/api/ai/route.ts` is the server endpoint. Server code can read your API keys without sending them to the browser. Chat responses use newline-separated JSON events: a text event redraws the current reply; a final result contains validated actions.

`lib/hackmate/stream.ts` extracts the answer from partially received JSON. Escaped quotes and unfinished Unicode characters are handled without executing partial actions.

`lib/hackmate/ai.ts` translates the same request into NVIDIA or Gemini formats. This setup uses NVIDIA. Ideas and plans use generation-time JSON schemas. Streaming chat uses an explicit JSON instruction, then the same strict validation. If its JSON is malformed, the app retries once with the schema. This keeps changing the AI provider separate from changing the screen.

`lib/hackmate/operations.ts` validates and applies changes to a copy of the workspace. For example, `remove_member` removes the selected person and clears their task ownership. If any action in a batch is invalid, the entire batch is rejected. Opening a panel is never a project-selection operation.

`lib/hackmate/read-pdf.ts` reads text from PDFs using PDF.js. Its licensed worker is in `public/pip-pdf.worker.mjs`; that large library file is third-party code, not code you need to explain line by line. Our small wrapper limits size/pages, extracts text, and rejects unreadable scans.

`app/api/research/route.ts` searches public web excerpts, decodes source links, and filters unrelated results. These excerpts are treated as untrusted reference data, never instructions.

`hooks/use-companion-voice.ts` handles permission, recording, transcription, voice playback, interruption, and cleanup. `app/api/transcribe/route.ts` calls ElevenLabs Scribe. `app/api/voice/route.ts` calls the configured V4 Turbo voice and adds expression tags.

`components/companion.tsx` draws Pip as SVG. One group grows a limb; an inner group moves that limb. This lets arms grow smoothly while waving. Four arms appear for multitasking actions.

`lib/hackmate/motions.ts` names the 30 gestures. `operationMotions()` turns actual changes into a gesture sequence, so a response that adds a teammate and a task shows both actions. Talking moves the mouth independently and no longer replaces the action gesture. `app/globals.css` defines the movements. Reduced-motion device preferences disable motion while keeping readable status labels.

`lib/hackmate/storage.ts` saves in IndexedDB, the browser’s local database. Writes run in order so an older save cannot overwrite a reset. The workspace persists after a reload; it does not synchronize between teammates.

## Check the app

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-ai.mjs
node scripts/test-conversation.mjs
node scripts/test-voice.mjs
node scripts/test-flow.mjs
node scripts/run-framework.mjs build
```

Automated tests use synthetic data. Actual microphone access still needs your permission and connected microphone. Live verification used NVIDIA, Chris V4 Turbo, synthetic transcription audio, and public search. No Gemini calls were made. Source ZIP packaging excludes actual API keys.

## Boundaries

GitHub/Discord account connections, a desktop floating window, shared multi-user state, and a system-wide shortcut remain future work. Demo mode is scripted and does not analyze event documents. Tiny lettering, unusual logos, and low-quality scans can still produce imperfect OCR; unreadable pages are marked in the extracted text. Past-event search results require verification against the current official brief. Pip supports planning and team bonding; it cannot guarantee winning.


## Team and voice reliability update

Saying “My name is …” during team intake now saves your name immediately. Pip keeps unknown skills empty and asks for them. A solo introduction can finish the team step; it also offers document upload. A migration recovers the previously unsaved self-introduction from your local conversation without adding departed teammates.

AI replies need both words and a validated action to change the team. A claim such as “I've added you” with no action is rejected and retried once. Action confirmations wait for validation, so an unfinished streamed response cannot announce a successful change.

For ordinary conversation, the first completed sentence begins voice generation while the reply continues arriving. The rest queues after it, rather than restarting the first sentence. Mutation replies wait for validation. Provider speed still varies.

Under Settings, choose **Export diagnostic logs**. It downloads a JSON file with the last 500 request, action, save, gesture, and voice events. These stay in a separate browser database after reloading or resetting your hackathon. They exclude prompts, documents, audio, and keys. Server terminal logs include matching request IDs. API response headers measure time to headers, while `assistant.committed` marks a completed response.

Run `npm test` for all 93 automated checks, including the failed conversational introduction and queued-speech cancellation. Tests cannot replace checking your physical microphone and permissions.


## How image PDFs are read

Some PDFs store a picture of each slide instead of selectable text. `read-pdf.ts` first asks PDF.js for embedded text. When a page has little or no text, it renders that page to a canvas and uses Tesseract.js to recognize the image's words. Dark slides are inverted for better recognition. A second sparse-text pass helps with large chapter headings. Native text pages bypass OCR.

`pdf-text.ts` keeps one `[Page n]` section per page and enforces page/text limits. `read-documents.ts` handles each file independently, so a broken upload cannot throw away its readable siblings. Resetting aborts reading and releases workers. Document logs record page counts, progress, recognized-character counts, and confidence, without storing the page contents in diagnostics.

The OCR worker, WASM cores, and English model live under `public/ocr`, so recognition stays in the browser and needs no new API key. `node scripts/prepare-ocr-assets.mjs` refreshes these assets from the installed npm packages. Extraction takes longer for image pages. Sponsor logos and small text may need human verification; Pip must ask when facts are missing.
