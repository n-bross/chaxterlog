import test from "node:test";
import assert from "node:assert/strict";
import { encodeTiff } from "./tiff.ts";

test("TIFF declares RGB dimensions and preserves row-major pixels and alpha", () => {
  const bytes = encodeTiff(2, 2, new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 0, 0, 0, 0,
  ]));
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(0, true), 0x4949);
  assert.equal(view.getUint16(2, true), 42);
  const directory = view.getUint32(4, true);
  const count = view.getUint16(directory, true);
  const tags = new Map<number, { type: number; count: number; value: number }>();
  for (let i = 0; i < count; i++) {
    const start = directory + 2 + i * 12;
    tags.set(view.getUint16(start, true), { type: view.getUint16(start + 2, true), count: view.getUint32(start + 4, true), value: view.getUint32(start + 8, true) });
  }
  assert.equal(tags.get(256)?.value, 2);
  assert.equal(tags.get(257)?.value, 2);
  assert.equal(tags.get(259)?.value, 1);
  assert.equal(tags.get(262)?.value, 2);
  assert.equal(tags.get(277)?.value, 3);
  const bits = tags.get(258)!;
  assert.equal(bits.count, 3);
  assert.deepEqual([0, 2, 4].map((i) => view.getUint16(bits.value + i, true)), [8, 8, 8]);
  const pixels = tags.get(273)!.value;
  assert.equal(tags.get(279)?.value, 12);
  assert.equal(view.getUint32(directory + 2 + count * 12, true), 0);
  assert.deepEqual([...bytes.slice(pixels)], [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
});

test("TIFF refuses empty, fractional or mismatched image dimensions", () => {
  for (const [width, height] of [[0, 1], [1.5, 1], [1, -1], [2, 1]]) {
    assert.throws(() => encodeTiff(width, height, new Uint8ClampedArray(4)));
  }
});
