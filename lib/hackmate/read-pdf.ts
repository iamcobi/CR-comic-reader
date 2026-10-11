import * as pdf from "pdfjs-dist";

export async function readPDF(file: File): Promise<string> {
  // Serve the licensed worker as a static file, keeping page-only development code out.
  if (!pdf.GlobalWorkerOptions.workerPort)
    pdf.GlobalWorkerOptions.workerPort = new Worker("/pip-pdf.worker.mjs", {
      type: "module",
    });
  const loading = pdf.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const document = await Promise.race([
      loading.promise,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () =>
            reject(
              new Error(
                "The PDF reader timed out. Please retry or paste the relevant text.",
              ),
            ),
          20000,
        );
      }),
    ]);
    if (document.numPages > 80)
      throw new Error("Please upload a brief with 80 pages or fewer.");
    let text = "";
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      text +=
        `\n[Page ${number}]\n` +
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      if (text.length > 100000)
        throw new Error(
          "Please upload a shorter brief or paste the relevant sections.",
        );
    }
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 30)
      throw new Error(
        "This PDF has no readable text. Please paste its rules or provide a text version; I won’t guess from unreadable pages.",
      );
    return text;
  } finally {
    if (deadline) clearTimeout(deadline);
    await loading.destroy();
  }
}
