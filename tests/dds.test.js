const test = require("node:test");
const assert = require("node:assert/strict");
const DDS = require("../dds.js");

test("encodes and decodes an RGBA DDS texture", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 128
  ]);
  const encoded = DDS.encodeRGBA(2, 2, pixels, 1);
  const decoded = DDS.decode(encoded);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(Array.from(decoded.data), Array.from(pixels));
});

test("writes requested mipmap chain", () => {
  const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(200);
  const encoded = DDS.encodeRGBA(8, 8, pixels, 4);
  const info = DDS.getInfo(encoded);
  assert.equal(info.mipCount, 4);
  assert.equal(info.width, 8);
  assert.equal(info.height, 8);
});

test("rejects a non-DDS buffer", () => {
  assert.throws(() => DDS.decode(new ArrayBuffer(16)), /DDS/);
});

test("decodes a basic DXT1 block", () => {
  const buffer = new ArrayBuffer(136);
  const view = new DataView(buffer);
  view.setUint32(0, 0x20534444, true); view.setUint32(4, 124, true);
  view.setUint32(8, 0x81007, true); view.setUint32(12, 4, true); view.setUint32(16, 4, true);
  view.setUint32(28, 1, true); view.setUint32(76, 32, true); view.setUint32(80, 4, true);
  view.setUint32(84, 0x31545844, true); view.setUint32(108, 0x1000, true);
  view.setUint16(128, 0xf800, true); view.setUint16(130, 0x07e0, true); view.setUint32(132, 0, true);
  const decoded = DDS.decode(buffer);
  assert.equal(decoded.data[0], 255);
  assert.equal(decoded.data[1], 0);
  assert.equal(decoded.data[2], 0);
  assert.equal(decoded.data[3], 255);
});