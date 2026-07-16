import assert from 'node:assert';
import { getSnapshotUrl, parseRtspUrl } from '../../../frontend/src/utils/cameraUtils.js';

// --- Test getSnapshotUrl ---
console.log('Testing getSnapshotUrl...');

// Mock Date.now() for deterministic testing
const originalDateNow = Date.now;
const MOCK_TIME = 1620000000000;
Date.now = () => MOCK_TIME;

try {
  // Case 1: Missing cameraId
  assert.strictEqual(getSnapshotUrl(), null);
  assert.strictEqual(getSnapshotUrl(null), null);
  assert.strictEqual(getSnapshotUrl(''), null);

  // Case 2: Only cameraId provided (should use default streamIndex 0 and add cache buster)
  assert.strictEqual(
    getSnapshotUrl('cam123'),
    `/api/cameras/cam123/snapshot?stream=0&_t=${MOCK_TIME}`
  );

  // Case 3: Custom streamIndex provided
  assert.strictEqual(
    getSnapshotUrl('cam123', 1),
    `/api/cameras/cam123/snapshot?stream=1&_t=${MOCK_TIME}`
  );

  // Case 4: eventId provided (should NOT add cache buster)
  assert.strictEqual(
    getSnapshotUrl('cam123', 0, 'evt456'),
    `/api/cameras/cam123/snapshot?stream=0&event_id=evt456`
  );

  console.log('✅ getSnapshotUrl tests passed.');
} finally {
  // Restore original Date.now()
  Date.now = originalDateNow;
}

// --- Test parseRtspUrl ---
console.log('Testing parseRtspUrl...');

// Empty/Null
assert.deepStrictEqual(parseRtspUrl(), { user: '', pass: '', host: '', protocol: 'rtsp' });
assert.deepStrictEqual(parseRtspUrl(''), { user: '', pass: '', host: '', protocol: 'rtsp' });

// Just host
assert.deepStrictEqual(parseRtspUrl('rtsp://192.168.1.100'), {
  user: '', pass: '', host: '192.168.1.100', protocol: 'rtsp'
});

// Host and port
assert.deepStrictEqual(parseRtspUrl('rtsp://192.168.1.100:554/stream1'), {
  user: '', pass: '', host: '192.168.1.100:554/stream1', protocol: 'rtsp'
});

// User and host
assert.deepStrictEqual(parseRtspUrl('rtsp://admin@192.168.1.100'), {
  user: 'admin', pass: '', host: '192.168.1.100', protocol: 'rtsp'
});

// User, pass, and host
assert.deepStrictEqual(parseRtspUrl('rtsp://admin:password@192.168.1.100'), {
  user: 'admin', pass: 'password', host: '192.168.1.100', protocol: 'rtsp'
});

// Other protocols (e.g., rtsps, http)
assert.deepStrictEqual(parseRtspUrl('rtsps://admin:password@192.168.1.100'), {
  user: 'admin', pass: 'password', host: '192.168.1.100', protocol: 'rtsps'
});

// URL-encoded credentials
assert.deepStrictEqual(parseRtspUrl('rtsp://admin:pass%21word@192.168.1.100'), {
  user: 'admin', pass: 'pass!word', host: '192.168.1.100', protocol: 'rtsp'
});

// Test error path (console.error suppression)
const originalConsoleError = console.error;
let errorLogged = false;
console.error = () => { errorLogged = true; };
try {
  assert.deepStrictEqual(parseRtspUrl({ not: 'a string' }), { user: '', pass: '', host: { not: 'a string' }, protocol: 'rtsp' });
  assert.strictEqual(errorLogged, true);
} finally {
  console.error = originalConsoleError;
}

console.log('✅ parseRtspUrl tests passed.');
console.log('🎉 All cameraUtils tests passed successfully.');
