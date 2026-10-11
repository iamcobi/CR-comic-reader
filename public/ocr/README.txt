Local OCR assets

Worker: tesseract.js 7.0.0, https://github.com/naptha/tesseract.js
Core: tesseract.js-core 7.0.0, https://github.com/naptha/tesseract.js-core
English data: @tesseract.js-data/eng 1.0.0, https://github.com/naptha/tessdata

Worker/core Apache-2.0 license text and bundled dependency notices are included
alongside these files. The English data npm package declares the MIT license.
Language data uses the compact 4.0.0_best_int distribution.

Refresh the assets after installing dependencies:
  node scripts/prepare-ocr-assets.mjs

Images and recognized document content remain in the user's browser. These
assets are served by the app instead of loaded from an external OCR service.
