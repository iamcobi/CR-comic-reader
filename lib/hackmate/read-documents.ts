import type { Brief, Provider } from "./types";
import type { PDFProgress } from "./pdf-text";
import { logEvent } from "./diagnostics";

export async function readDocuments(
  files: File[],
  existing: Brief[],
  provider: Provider,
  options: {
    signal?: AbortSignal;
    onProgress?: (filename: string, event: PDFProgress) => void;
  } = {},
) {
  const added: Brief[] = [],
    failures: string[] = [];
  let size = existing.reduce(
    (sum, d) => sum + (d.data?.length || d.text?.length || 0),
    0,
  );
  for (const file of files) {
    options.signal?.throwIfAborted();
    try {
      if (existing.length + added.length >= 12)
        throw new Error("You can keep up to 12 documents.");
      if (file.size > 50 * 1024 * 1024)
        throw new Error("Keep each file at 50 MB or smaller.");
      const isPDF =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isText = /\.(txt|md|csv)$/i.test(file.name) || isPDF;
      if (!isText && provider === "nvidia")
        throw new Error(
          "Upload PDF, TXT, Markdown, or CSV. Image pages inside PDFs are read with local OCR.",
        );
      if (
        !isText &&
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error(
          "Upload TXT, Markdown, CSV, PDF, PNG, JPG, or WebP. Export slides to PDF first.",
        );
      logEvent("document.started", { bytes: file.size, pdf: isPDF });
      let content: string;
      if (isPDF) {
        const { readPDF } = await import("./read-pdf");
        content = await readPDF(file, {
          signal: options.signal,
          onProgress: (event) => options.onProgress?.(file.name, event),
        });
      } else if (isText) content = await file.text();
      else
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(new Error("Could not read this image."));
          reader.readAsDataURL(file);
        });
      options.signal?.throwIfAborted();
      if (!content.trim())
        throw new Error("This file has no readable content.");
      if (isText && content.length > 100000)
        throw new Error(
          "Keep each extracted document below 100,000 characters.",
        );
      if (size + content.length > 8 * 1024 * 1024)
        throw new Error(
          "Keep combined extracted text and image content under 8 MB. Larger PDFs are supported when their extracted text fits this limit.",
        );
      added.push({
        id: crypto.randomUUID(),
        name: file.name,
        mime: isText ? "text/plain" : file.type,
        ...(isText ? { text: content } : { data: content }),
      });
      size += content.length;
      logEvent("document.read", {
        bytes: file.size,
        characters: content.length,
        pdf: isPDF,
      });
    } catch (error) {
      options.signal?.throwIfAborted();
      failures.push(
        `${file.name}: ${error instanceof Error ? error.message : "Could not read this file."}`,
      );
      logEvent("document.failed", { bytes: file.size });
    }
  }
  return { added, failures };
}
