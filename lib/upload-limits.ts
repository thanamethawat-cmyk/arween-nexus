/** A reviewer may choose a file this large. The browser shrinks it before the request. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Bytes accepted by the server after preparation.
 * Vercel Hobby drops serverless request bodies around 4.5 MB, so this stays at 3 MB.
 */
export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;

/** Longest edge of an image sent to the vision model. */
export const MAX_IMAGE_EDGE = 1600;

/** Soft target so a vision call does not grow with the original photo. */
export const TARGET_IMAGE_BYTES = 1_200_000;

export const MAX_PDF_PAGES = 2;
export const MIN_PDF_TEXT_CHARS = 80;
