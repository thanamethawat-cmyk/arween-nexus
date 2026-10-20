import {
  MAX_IMAGE_EDGE,
  MAX_PAYLOAD_BYTES,
  MAX_PDF_PAGES,
  MAX_SOURCE_BYTES,
  MIN_PDF_TEXT_CHARS,
  TARGET_IMAGE_BYTES,
} from "./upload-limits";

const MAX_TEXT_CHARS = 200_000;

export {
  MAX_IMAGE_EDGE,
  MAX_PAYLOAD_BYTES,
  MAX_PDF_PAGES,
  MAX_SOURCE_BYTES,
  MIN_PDF_TEXT_CHARS,
  TARGET_IMAGE_BYTES,
};

export type UploadKind = "image" | "pdf" | "text" | "unknown";
export type PrepareCode = "fileTooBig" | "fileShrinkFail" | "fileTextTooBig" | "fileType" | "fileUnreadable";

export class PrepareError extends Error {
  constructor(readonly code: PrepareCode) {
    super(code);
  }
}

export function uploadKind(file: { name: string; type: string }): UploadKind {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("text/") || mime === "application/json" || name.endsWith(".txt") || name.endsWith(".json")) return "text";
  return "unknown";
}

export function fittedSize(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): { width: number; height: number } {
  if (width < 1 || height < 1) return { width: 1, height: 1 };
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareUpload(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) throw new PrepareError("fileTooBig");
  const kind = uploadKind(file);
  if (kind === "unknown") throw new PrepareError("fileType");
  if (kind === "text") {
    if (file.size > MAX_PAYLOAD_BYTES) throw new PrepareError("fileTextTooBig");
    const text = await file.text();
    if (text.length > MAX_TEXT_CHARS) throw new PrepareError("fileTextTooBig");
    return file;
  }
  if (kind === "pdf") return preparePdf(file);
  return shrinkImage(file);
}

/** Text PDFs stay text. A scan, at any size, becomes a page image so the vision model can read it. */
export function pdfDelivery(options: { bytes: number; textChars: number }): "original" | "text" | "raster" {
  if (options.textChars >= MIN_PDF_TEXT_CHARS) {
    return options.bytes <= MAX_PAYLOAD_BYTES ? "original" : "text";
  }
  return "raster";
}

async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new PrepareError("fileType");
  try {
    const jpegName = /jpe?g/i.test(`${file.type} ${file.name}`);
    if (jpegName && bitmap.width <= MAX_IMAGE_EDGE && bitmap.height <= MAX_IMAGE_EDGE && file.size <= TARGET_IMAGE_BYTES) {
      return file;
    }
    const blob = await shrinkBitmap(bitmap);
    return new File([blob], renamed(file.name, "jpg"), { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

async function preparePdf(file: File): Promise<File> {
  const { getDocumentProxy, extractText, renderPageAsImage } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  try {
    const extracted = await extractText(pdf, { mergePages: true });
    const text = (Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "")).trim();
    const delivery = pdfDelivery({ bytes: file.size, textChars: text.replace(/\s/g, "").length });
    if (delivery === "original") return file;
    if (delivery === "text") {
      return new File([text.slice(0, MAX_TEXT_CHARS)], renamed(file.name, "txt"), { type: "text/plain" });
    }
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const bitmaps: ImageBitmap[] = [];
    try {
      for (let page = 1; page <= pages; page += 1) {
        const png = await renderPageAsImage(pdf, page, { width: 1200 });
        bitmaps.push(await createImageBitmap(new Blob([png], { type: "image/png" })));
      }
      const stacked = stackBitmaps(bitmaps);
      if (mostlyBlankCanvas(stacked)) throw new PrepareError("fileUnreadable");
      const blob = await shrinkBitmap(stacked);
      return new File([blob], renamed(file.name, "jpg"), { type: "image/jpeg" });
    } finally {
      for (const bitmap of bitmaps) bitmap.close();
    }
  } catch (error) {
    if (error instanceof PrepareError) throw error;
    throw new PrepareError("fileShrinkFail");
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** A page that is almost all white has nothing for the vision model to read. */
export function mostlyBlankCanvas(canvas: HTMLCanvasElement, threshold = 0.985): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width < 1 || canvas.height < 1) return true;
  const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 48));
  let blank = 0;
  let total = 0;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const [r = 0, g = 0, b = 0] = ctx.getImageData(x, y, 1, 1).data;
      total += 1;
      if (r > 248 && g > 248 && b > 248) blank += 1;
    }
  }
  return total > 0 && blank / total >= threshold;
}

function stackBitmaps(bitmaps: ImageBitmap[]): HTMLCanvasElement {
  const gap = bitmaps.length > 1 ? 16 : 0;
  const width = Math.max(...bitmaps.map((bitmap) => bitmap.width));
  const height = bitmaps.reduce((sum, bitmap) => sum + bitmap.height, 0) + gap * Math.max(0, bitmaps.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrepareError("fileShrinkFail");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const bitmap of bitmaps) {
    ctx.drawImage(bitmap, 0, y);
    y += bitmap.height + gap;
  }
  return canvas;
}

async function shrinkBitmap(source: CanvasImageSource & { width: number; height: number }): Promise<Blob> {
  let edge = MAX_IMAGE_EDGE;
  let quality = 0.82;
  let last: Blob | null = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const size = fittedSize(source.width, source.height, edge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PrepareError("fileShrinkFail");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(source, 0, 0, size.width, size.height);
    last = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality));
    if (last && last.size <= TARGET_IMAGE_BYTES) return last;
    quality = Math.max(0.55, quality - 0.08);
    edge = Math.round(edge * 0.85);
  }
  if (last && last.size <= MAX_PAYLOAD_BYTES) return last;
  throw new PrepareError("fileShrinkFail");
}

function renamed(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "invoice";
  return `${base.slice(0, 80)}.${extension}`;
}
