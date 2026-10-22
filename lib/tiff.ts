// Baseline TIFF: little-endian, uncompressed, chunky 8-bit RGB, one strip.
// Flatten RGBA against white so readers do not need TIFF alpha extensions.
export function encodeTiff(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error("Ungültige Bilddaten");
  }
  const entries = 10;
  const bitsOffset = 8 + 2 + entries * 12 + 4;
  const pixelsOffset = bitsOffset + 6;
  const byteCount = width * height * 3;
  if (pixelsOffset + byteCount > 0xffffffff) throw new Error("Bild zu groß für TIFF");
  const bytes = new Uint8Array(pixelsOffset + byteCount);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries, true);
  let offset = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
    offset += 12;
  };
  entry(256, 4, 1, width);
  entry(257, 4, 1, height);
  entry(258, 3, 3, bitsOffset);
  entry(259, 3, 1, 1); // no compression
  entry(262, 3, 1, 2); // RGB
  entry(273, 4, 1, pixelsOffset);
  entry(277, 3, 1, 3); // samples per pixel
  entry(278, 4, 1, height);
  entry(279, 4, 1, byteCount);
  entry(284, 3, 1, 1); // interleaved channels
  for (let i = 0; i < 3; i++) view.setUint16(bitsOffset + i * 2, 8, true);
  for (let src = 0, dest = pixelsOffset; src < rgba.length; src += 4) {
    const alpha = rgba[src + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      bytes[dest++] = Math.round(rgba[src + channel] * alpha + 255 * (1 - alpha));
    }
  }
  return bytes;
}
