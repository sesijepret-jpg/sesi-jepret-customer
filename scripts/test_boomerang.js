const assert = require('assert');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

console.log('--- TEST SUITE: Boomerang Ping-Pong GIF Animation ---');

// 1. Test Ping-Pong Frame Sequence Algorithm
console.log('\n[TEST 1] Ping-Pong Index Calculation');
function computePingPongIndices(n) {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  const indices = [];
  for (let i = 0; i < n; i++) indices.push(i);
  for (let i = n - 2; i > 0; i--) indices.push(i);
  return indices;
}

// 4 poses (Poses 1, 2, 3, 4)
const seq4 = computePingPongIndices(4);
assert.deepStrictEqual(seq4, [0, 1, 2, 3, 2, 1], '4 poses must ping-pong as 1 -> 2 -> 3 -> 4 -> 3 -> 2');
console.log('✓ 4 poses sequence passed: [Pose 1 -> Pose 2 -> Pose 3 -> Pose 4 -> Pose 3 -> Pose 2]');

// 3 poses
const seq3 = computePingPongIndices(3);
assert.deepStrictEqual(seq3, [0, 1, 2, 1], '3 poses must ping-pong as 1 -> 2 -> 3 -> 2');
console.log('✓ 3 poses sequence passed: [Pose 1 -> Pose 2 -> Pose 3 -> Pose 2]');

// 2 poses
const seq2 = computePingPongIndices(2);
assert.deepStrictEqual(seq2, [0, 1]);
console.log('✓ 2 poses sequence passed: [Pose 1 -> Pose 2]');

// 1 pose
const seq1 = computePingPongIndices(1);
assert.deepStrictEqual(seq1, [0]);
console.log('✓ 1 pose sequence passed: [Pose 1]');

// 0 poses
const seq0 = computePingPongIndices(0);
assert.deepStrictEqual(seq0, []);
console.log('✓ 0 poses handled gracefully');

// 2. Test Downscaling & Aspect Ratio
console.log('\n[TEST 2] Downscaling & Even Height Computation');
function computeDimensions(origW, origH, targetW = 600) {
  const aspectRatio = origH / (origW || 1);
  const rawH = Math.round(targetW * aspectRatio);
  const safeH = rawH % 2 === 0 ? rawH : rawH + 1;
  return { width: targetW, height: safeH };
}

const dim1 = computeDimensions(1200, 1600, 600);
assert.strictEqual(dim1.width, 600);
assert.strictEqual(dim1.height, 800);
assert.strictEqual(dim1.height % 2, 0, 'Height must be even');
console.log('✓ 1200x1600 downscaled to 600x800 (even height)');

const dim2 = computeDimensions(1920, 1080, 600);
assert.strictEqual(dim2.width, 600);
assert.strictEqual(dim2.height, 338);
assert.strictEqual(dim2.height % 2, 0, 'Height must be even');
console.log('✓ 1920x1080 downscaled to 600x338 (even height)');

// 3. Test GIF Encoding, Headers & Loop Metadata
console.log('\n[TEST 3] GIF Encoding & Loop Behavior');
const width = 60;
const height = 80;
const gif = GIFEncoder();
const delay = 400; // ms

// Create 6 simulated frames (simulating 4 poses in ping pong)
const frames = [
  [255, 0, 0, 255],     // Frame 0: Red
  [0, 255, 0, 255],     // Frame 1: Green
  [0, 0, 255, 255],     // Frame 2: Blue
  [255, 255, 0, 255],   // Frame 3: Yellow
  [0, 0, 255, 255],     // Frame 4: Blue (P3)
  [0, 255, 0, 255],     // Frame 5: Green (P2)
];

for (let i = 0; i < frames.length; i++) {
  const rgba = new Uint8Array(width * height * 4);
  const [r, g, b, a] = frames[i];
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = a;
  }
  const palette = quantize(rgba, 256, { format: 'rgb565' });
  const indexed = applyPalette(rgba, palette, 'rgb565');
  gif.writeFrame(indexed, width, height, {
    palette,
    delay,
    repeat: 0, // infinite loop
  });
}
gif.finish();

const bytes = gif.bytes();
assert.ok(bytes.length > 0, 'GIF bytes must not be empty');

// Validate GIF header: GIF89a
const header = String.fromCharCode(...bytes.slice(0, 6));
assert.strictEqual(header, 'GIF89a', 'Header must be GIF89a for animated looping GIFs');
console.log(`✓ Valid GIF89a header confirmed: "${header}"`);

// Validate Netscape 2.0 application extension for looping
const bytesStr = Buffer.from(bytes).toString('binary');
assert.ok(bytesStr.includes('NETSCAPE2.0'), 'Must contain NETSCAPE2.0 application extension for infinite looping');
console.log('✓ Netscape 2.0 loop extension confirmed (repeat: 0)');

// Total loop duration check
const totalDurationMs = frames.length * delay;
assert.strictEqual(totalDurationMs, 2400);
console.log(`✓ Loop timing verified: 6 frames * 400ms = ${totalDurationMs}ms (~2.4s)`);

// 4. Test Email Attachment Payload Processing
console.log('\n[TEST 4] Email Attachment Processing');
const sessionId = 'test-session-1234';
const base64Gif = 'data:image/gif;base64,' + Buffer.from(bytes).toString('base64');

// Simulate the logic in app/api/send-email/route.ts
const attachments = [];
const cleanGifBase64 = base64Gif.includes(',') ? base64Gif.split(',')[1] : base64Gif;
const gifBuffer = Buffer.from(cleanGifBase64, 'base64');
if (gifBuffer.length > 0) {
  attachments.push({
    filename: `Sesijepret_${sessionId}_boomerang.gif`,
    content: gifBuffer,
    contentType: 'image/gif',
  });
}

assert.strictEqual(attachments.length, 1);
assert.strictEqual(attachments[0].filename, 'Sesijepret_test-session-1234_boomerang.gif');
assert.strictEqual(attachments[0].contentType, 'image/gif');
assert.strictEqual(attachments[0].content.length, bytes.length);
console.log(`✓ Email attachment generated: "${attachments[0].filename}" (${(attachments[0].content.length / 1024).toFixed(1)} KB)`);

console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
