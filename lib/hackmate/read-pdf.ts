import * as pdf from "pdfjs-dist";
import { createWorker, OEM, PSM, type Worker as OCRWorker } from "tesseract.js";
import { extractPDFText, type PDFProgress } from "./pdf-text";
import { logEvent } from "./diagnostics";
import { cleanupResource } from "./cleanup";

type ReadOptions = {
  signal?: AbortSignal;
  onProgress?: (event: PDFProgress) => void;
};
function waitFor<T>(
  promise: Promise<T>,
  milliseconds: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      finish(() =>
        reject(new DOMException("Document reading canceled", "AbortError")),
      );
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              "This page took too long to read. Please retry or upload a clearer page.",
            ),
          ),
        ),
      milliseconds,
    );
    function finish(callback: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      callback();
    }
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
export async function readPDF(
  file: File,
  options: ReadOptions = {},
): Promise<string> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (!pdf.GlobalWorkerOptions.workerPort)
    pdf.GlobalWorkerOptions.workerPort = new Worker("/pip-pdf.worker.mjs", {
      type: "module",
    });
  const loading = pdf.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let ocr: OCRWorker | undefined,
    closed = false,
    currentPage = 0,
    total = 0;
  const abortOCR = () => {
    void cleanupResource(() => ocr?.terminate(), "ocr");
  };
  signal?.addEventListener("abort", abortOCR, { once: true });
  try {
    const document = await waitFor(loading.promise, 30000, signal);
    total = document.numPages;
    logEvent("document.opened", { pages: total, bytes: file.size });
    return await extractPDFText(
      total,
      async (number) => {
        currentPage = number;
        const page = await waitFor(document.getPage(number), 30000, signal);
        const content = await waitFor(page.getTextContent(), 30000, signal);
        const embeddedText = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
        return {
          embeddedText,
          cleanup: () => page.cleanup(),
          recognize: async () => {
            signal?.throwIfAborted();
            if (!ocr) {
              const starting = createWorker("eng", OEM.LSTM_ONLY, {
                workerPath: "/ocr/worker.min.js",
                corePath: "/ocr",
                langPath: "/ocr",
                workerBlobURL: false,
                logger: (event) => {
                  if (
                    !closed &&
                    !signal?.aborted &&
                    event.status === "recognizing text"
                  )
                    onProgress?.({
                      page: currentPage,
                      total,
                      phase: "ocr",
                      percent: Math.round(event.progress * 100),
                    });
                },
                errorHandler: () => logEvent("document.ocr_worker_failed"),
              });
              void starting.then(
                (worker) => {
                  if (closed || signal?.aborted) void cleanupResource(() => worker.terminate(), "late-ocr");
                },
                () => {},
              );
              ocr = await waitFor(starting, 45000, signal);
              await ocr.setParameters({
                tessedit_pageseg_mode: PSM.AUTO,
                preserve_interword_spaces: "1",
              });
            }
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({
              scale: Math.min(3, 2200 / Math.max(base.width, base.height)),
            });
            const canvas = window.document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context)
              throw new Error(
                "Your browser could not render this PDF page for OCR.",
              );
            const render = page.render({
              canvas,
              canvasContext: context,
              viewport,
              background: "#ffffff",
            });
            const cancelRender = () => render.cancel();
            signal?.addEventListener("abort", cancelRender, { once: true });
            try {
              await waitFor(render.promise, 30000, signal);
              const pixels = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              );
              let brightness = 0;
              for (let i = 0; i < pixels.data.length; i += 16)
                brightness +=
                  (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) /
                  3;
              if (brightness / Math.ceil(pixels.data.length / 16) < 110) {
                for (let i = 0; i < pixels.data.length; i += 4) {
                  const gray =
                    255 -
                    (pixels.data[i] * 0.299 +
                      pixels.data[i + 1] * 0.587 +
                      pixels.data[i + 2] * 0.114);
                  pixels.data[i] =
                    pixels.data[i + 1] =
                    pixels.data[i + 2] =
                      gray;
                }
                context.putImageData(pixels, 0, 0);
              }
              let result = await waitFor(ocr.recognize(canvas), 60000, signal);
              // Automatic layout detection can miss a huge chapter heading.
              // A sparse-text pass recovers those labels without changing paragraphs.
              if (result.data.text.trim().length < 40) {
                await ocr.setParameters({
                  tessedit_pageseg_mode: PSM.SPARSE_TEXT,
                });
                try {
                  const sparse = await waitFor(
                    ocr.recognize(canvas),
                    60000,
                    signal,
                  );
                  if (
                    sparse.data.confidence >= 25 &&
                    sparse.data.text.trim().length >
                      result.data.text.trim().length
                  )
                    result = sparse;
                } finally {
                  if (!signal?.aborted)
                    await ocr.setParameters({
                      tessedit_pageseg_mode: PSM.AUTO,
                    });
                }
              }
              logEvent("document.page_ocr", {
                page: number,
                characters: result.data.text.trim().length,
                confidence: Math.round(result.data.confidence),
              });
              return {
                text: result.data.text,
                confidence: result.data.confidence,
              };
            } finally {
              signal?.removeEventListener("abort", cancelRender);
              render.cancel();
              canvas.width = canvas.height = 0;
            }
          },
        };
      },
      onProgress,
      signal,
    );
  } finally {
    closed = true;
    signal?.removeEventListener("abort", abortOCR);
    await cleanupResource(() => ocr?.terminate(), "ocr");
    await cleanupResource(() => loading.destroy(), "pdf");
  }
}
