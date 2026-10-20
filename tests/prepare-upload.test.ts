import { describe, expect, it } from "vitest";
import { t } from "../lib/i18n";
import { contentTooLarge, demoLimits } from "../lib/demo-limits";
import { fittedSize, pdfDelivery, uploadKind } from "../lib/prepare-upload";
import { MAX_IMAGE_EDGE, MAX_PAYLOAD_BYTES, MAX_SOURCE_BYTES, MIN_PDF_TEXT_CHARS } from "../lib/upload-limits";
import { THEME_BOOT, THEME_KEY, themeFromPreference } from "../lib/theme";

describe("theme preference", () => {
  it("uses a saved choice and otherwise follows the system", () => {
    expect(themeFromPreference("dark", false)).toBe("dark");
    expect(themeFromPreference("light", true)).toBe("light");
    expect(themeFromPreference(null, true)).toBe("dark");
    expect(themeFromPreference(null, false)).toBe("light");
    expect(themeFromPreference("system", true)).toBe("dark");
    expect(THEME_BOOT).toContain(THEME_KEY);
    expect(THEME_BOOT).toContain("prefers-color-scheme: dark");
  });
});

describe("browser upload preparation", () => {
  it("lets a reviewer pick 25 MB and keeps the request under the Hobby body cap", () => {
    expect(MAX_SOURCE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_PAYLOAD_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_PAYLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(MAX_IMAGE_EDGE).toBeLessThanOrEqual(1600);
    const previous = process.env.DEMO_MAX_UPLOAD_BYTES;
    delete process.env.DEMO_MAX_UPLOAD_BYTES;
    expect(demoLimits().maxUploadBytes).toBe(MAX_PAYLOAD_BYTES);
    if (previous === undefined) delete process.env.DEMO_MAX_UPLOAD_BYTES;
    else process.env.DEMO_MAX_UPLOAD_BYTES = previous;
  });

  it("scales the long edge down and leaves a small image alone", () => {
    expect(fittedSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fittedSize(0, 10)).toEqual({ width: 1, height: 1 });
  });

  it("recognizes invoice files and rejects the platform-sized body", () => {
    expect(uploadKind({ name: "pod.PNG", type: "" })).toBe("image");
    expect(uploadKind({ name: "bill.pdf", type: "application/pdf" })).toBe("pdf");
    expect(uploadKind({ name: "invoice.json", type: "" })).toBe("text");
    expect(uploadKind({ name: "notes.docx", type: "" })).toBe("unknown");
    const limits = demoLimits();
    const huge = new Request("http://local/api/analyze", { method: "POST", headers: { "content-length": "5000000" } });
    const small = new Request("http://local/api/analyze", { method: "POST", headers: { "content-length": "2000000" } });
    expect(contentTooLarge(huge, { ...limits, maxUploadBytes: MAX_PAYLOAD_BYTES })).toBe(true);
    expect(contentTooLarge(small, { ...limits, maxUploadBytes: MAX_PAYLOAD_BYTES })).toBe(false);
  });

  it("rasterizes a scan and keeps a text PDF as text", () => {
    expect(pdfDelivery({ bytes: 20_000, textChars: MIN_PDF_TEXT_CHARS })).toBe("original");
    expect(pdfDelivery({ bytes: MAX_PAYLOAD_BYTES + 1, textChars: 400 })).toBe("text");
    expect(pdfDelivery({ bytes: 80_000, textChars: 0 })).toBe("raster");
    expect(pdfDelivery({ bytes: MAX_PAYLOAD_BYTES + 1, textChars: 12 })).toBe("raster");
  });

  it("states the 25 MB limit in Thai and English", () => {
    expect(t("en", "dropHint")).toContain("25 MB");
    expect(t("th", "dropHint")).toContain("25 MB");
    expect(t("en", "fileTooBig")).toContain("25 MB");
    expect(t("th", "fileTooBig")).toContain("25 MB");
    expect(t("en", "fileShrinkFail").length).toBeGreaterThan(20);
    expect(t("th", "fileTextTooBig")).toContain("3 MB");
    expect(t("en", "themeDark")).toBe("Dark mode");
    expect(t("th", "themeLight")).toBe("โหมดสว่าง");
  });
});
