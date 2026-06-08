import sharp from 'sharp';

export const MAX_IMAGE_WIDTH = 420;
export const MAX_IMAGE_HEIGHT = 315;

/**
 * Resize an image buffer to fit within the max dimensions, preserving aspect ratio.
 * Returns a JPEG buffer suitable for DOCX insertion.
 */
export async function resizeImageForDocx(inputBuffer: Buffer): Promise<Buffer> {
  const output = await sharp(inputBuffer)
    .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return output;
}

/**
 * Get image dimensions after resizing (for docxtemplater image module sizing).
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  const origW = meta.width ?? MAX_IMAGE_WIDTH;
  const origH = meta.height ?? MAX_IMAGE_HEIGHT;

  const ratio = Math.min(MAX_IMAGE_WIDTH / origW, MAX_IMAGE_HEIGHT / origH, 1);
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio),
  };
}

/**
 * Process an array of raw image buffers for DOCX insertion.
 */
export async function processImages(
  rawBuffers: Buffer[]
): Promise<{ data: Buffer; width: number; height: number }[]> {
  const results = [];
  for (const buf of rawBuffers) {
    const resized = await resizeImageForDocx(buf);
    const dims = await getImageDimensions(resized);
    results.push({ data: resized, ...dims });
  }
  return results;
}
