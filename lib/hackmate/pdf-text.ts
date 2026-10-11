// Separates the extraction workflow from the browser's rendering/worker APIs.
// Every page is accounted for; mixed PDFs cannot silently lose image-only pages.
export type PDFProgress = {
  page: number;
  total: number;
  phase: "text" | "ocr";
  percent?: number;
};
export type PDFTextPage = {
  embeddedText: string;
  recognize: () => Promise<{ text: string; confidence: number }>;
  cleanup: () => void;
};
export async function extractPDFText(
  total: number,
  getPage: (number: number) => Promise<PDFTextPage>,
  progress?: (event: PDFProgress) => void,
  signal?: AbortSignal,
) {
  if (total > 80)
    throw new Error("Please upload a brief with 80 pages or fewer.");
  let text = "",
    readable = 0;
  for (let number = 1; number <= total; number++) {
    signal?.throwIfAborted();
    progress?.({ page: number, total, phase: "text" });
    const page = await getPage(number);
    try {
      let content = page.embeddedText.trim();
      if (content.length < 40) {
        progress?.({ page: number, total, phase: "ocr", percent: 0 });
        const recognized = await page.recognize();
        signal?.throwIfAborted();
        // Retain short embedded labels on decorative pages when OCR finds nothing.
        if (
          recognized.text.trim().length > content.length &&
          recognized.confidence >= 25
        )
          content = recognized.text.trim();
      }
      readable += content.length;
      text += `\n[Page ${number}]\n${content || "[No readable text on this page]"}`;
      if (text.length > 100000)
        throw new Error(
          "Please upload a shorter brief or paste the relevant sections (maximum 100,000 extracted characters).",
        );
    } finally {
      page.cleanup();
    }
  }
  if (readable < 30)
    throw new Error(
      "I tried text extraction and OCR, but these pages are still unreadable. Please upload a clearer PDF or page images.",
    );
  return text;
}
