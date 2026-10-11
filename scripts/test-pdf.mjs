import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({
  stdin: {
    contents:
      "export * from './lib/hackmate/pdf-text'; export * from './lib/hackmate/read-documents';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "mock-pdf-renderer",
      setup(b) {
        b.onResolve({ filter: /^\.\/read-pdf$/ }, () => ({
          path: "pdf",
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents:
            'export async function readPDF(){throw new Error("Fixture unreadable PDF");}',
          loader: "js",
        }));
      },
    },
  ],
});
const { extractPDFText, readDocuments } = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
let count = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
const embedded =
  "Official hackathon rules: projects must be created during the event.";
function page(embeddedText, text = "", confidence = 90) {
  return {
    embeddedText,
    recognize: async () => ({ text, confidence }),
    cleanup() {},
  };
}
await test("Readable PDF pages bypass OCR and preserve exact text", async () => {
  const text = await extractPDFText(1, async () => ({
    ...page(embedded),
    recognize: () => {
      throw new Error("Unexpected OCR");
    },
  }));
  assert.ok(text.includes(embedded));
});
await test("Image-only PDF pages use OCR and preserve all page numbers", async () => {
  const progress = [];
  const text = await extractPDFText(
    2,
    async (n) =>
      page(
        "",
        n === 1
          ? "Opening ceremony at noon. Hacking begins at 1 PM."
          : "Sponsor track: use the API and submit a working demo.",
      ),
    (e) => progress.push(e),
  );
  assert.ok(text.includes("[Page 1]") && text.includes("[Page 2]"));
  assert.ok(progress.some((e) => e.phase === "ocr"));
  assert.match(text, /Hacking begins/);
});
await test("Mixed PDFs retain embedded pages and OCR image-only pages", async () => {
  const text = await extractPDFText(2, async (n) =>
    n === 1
      ? page(embedded)
      : page(
          "",
          "Image-page judging criteria: usefulness, originality, and a working demo.",
        ),
  );
  assert.match(text, /Official hackathon rules/);
  assert.match(text, /Image-page judging/);
});
await test("Blank decorative pages do not cause readable documents to fail", async () => {
  const text = await extractPDFText(2, async (n) =>
    n === 1 ? page(embedded) : page("", "", 0),
  );
  assert.match(text, /No readable text on this page/);
});
await test("Low-confidence OCR does not invent readable document content", async () => {
  await assert.rejects(
    extractPDFText(1, async () =>
      page(
        "",
        "Unreliable OCR text should never be accepted as the official rules.",
        10,
      ),
    ),
    /still unreadable/,
  );
});
await test("Oversized PDF page counts reject before starting OCR", async () => {
  await assert.rejects(
    extractPDFText(81, async () => {
      throw new Error("Should not render");
    }),
    /80 pages/,
  );
});
await test("Extracted-text limit counts OCR text too and releases the page", async () => {
  let cleaned = false;
  await assert.rejects(
    extractPDFText(1, async () => ({
      ...page("", "x".repeat(100001)),
      cleanup() {
        cleaned = true;
      },
    })),
    /100,000/,
  );
  assert.ok(cleaned);
});
await test("Canceled extraction never continues into later pages", async () => {
  const abort = new AbortController();
  abort.abort();
  let called = false;
  await assert.rejects(
    extractPDFText(
      2,
      async () => {
        called = true;
        return page(embedded);
      },
      undefined,
      abort.signal,
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(called, false);
});
await test("One unreadable upload does not discard a readable sibling", async () => {
  const result = await readDocuments(
    [
      new File(["broken"], "bad.pdf", { type: "application/pdf" }),
      new File([embedded], "rules.txt", { type: "text/plain" }),
    ],
    [],
    "nvidia",
  );
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].name, "rules.txt");
  assert.equal(result.failures.length, 1);
});
await test("Empty text files remain visible failures rather than empty context", async () => {
  const result = await readDocuments(
    [new File([""], "empty.txt")],
    [],
    "nvidia",
  );
  assert.equal(result.added.length, 0);
  assert.match(result.failures[0], /no readable content/);
});
console.log(`${count} PDF and upload checks passed.`);
