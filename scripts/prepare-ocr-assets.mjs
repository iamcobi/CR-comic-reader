import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "public", "ocr");
await mkdir(output, { recursive: true });
await copyFile(
  path.join(root, "node_modules/tesseract.js/dist/worker.min.js"),
  path.join(output, "worker.min.js"),
);
await copyFile(
  path.join(root, "node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt"),
  path.join(output, "worker.LICENSE.txt"),
);
await copyFile(
  path.join(root, "node_modules/tesseract.js/LICENSE.md"),
  path.join(output, "tesseract.LICENSE.md"),
);
for (const flavor of [
  "",
  "-simd",
  "-relaxedsimd",
  "-lstm",
  "-simd-lstm",
  "-relaxedsimd-lstm",
]) {
  const name = `tesseract-core${flavor}.wasm.js`;
  await copyFile(
    path.join(root, "node_modules/tesseract.js-core", name),
    path.join(output, name),
  );
}
await copyFile(
  path.join(root, "node_modules/tesseract.js-core/LICENSE"),
  path.join(output, "core.LICENSE"),
);
await copyFile(
  path.join(
    root,
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  ),
  path.join(output, "eng.traineddata.gz"),
);
console.log(
  "Prepared local OCR worker, WASM cores, and English language data.",
);
