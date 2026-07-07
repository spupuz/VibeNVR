import assert from 'assert';
import { parseRtspUrl } from '../../../frontend/src/utils/cameraUtils.js';

function testErrorPath() {
    let errorCaught = false;
    const originalConsoleError = console.error;
    console.error = (msg, err) => {
        if (msg === "URL parsing error") {
            errorCaught = true;
        }
    };

    try {
        parseRtspUrl({ not: 'a string' });
        assert.ok(errorCaught, 'Expected console.error to be called with "URL parsing error"');
        console.log('Error path test passed!');
    } finally {
        console.error = originalConsoleError;
    }
}

function testHappyPath() {
    const result = parseRtspUrl("rtsp://user:pass@192.168.1.100:554/stream");
    assert.strictEqual(result.user, 'user');
    assert.strictEqual(result.pass, 'pass');
    assert.strictEqual(result.host, '192.168.1.100:554/stream');
    assert.strictEqual(result.protocol, 'rtsp');
    console.log('Happy path test passed!');
}

try {
    testHappyPath();
    testErrorPath();
    process.exit(0);
} catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
}
