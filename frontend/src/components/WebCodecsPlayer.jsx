import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1500;

/**
 * Parse raw NALU bytes to extract the WebCodecs avc1.PPCCLL codec string
 * from the H.264 SPS NAL unit (type 7).
 *
 * A keyframe packet typically contains:
 *   SPS (type 7) → PPS (type 8) → IDR slice (type 5)
 * separated by 3- or 4-byte start codes (0x00 0x00 0x01 or 0x00 0x00 0x00 0x01).
 *
 * The first three payload bytes of an SPS unit are:
 *   profile_idc, constraint_flags, level_idc
 * which map directly to the avc1.PPCCLL codec string.
 */
function detectCodecFromSPS(naluBytes) {
    const buf = new Uint8Array(naluBytes);
    let i = 0;
    while (i < buf.length - 5) {
        // Find 3-byte start code
        if (buf[i] === 0x00 && buf[i + 1] === 0x00 && buf[i + 2] === 0x01) {
            const nalHeader = buf[i + 3];
            const nalType = nalHeader & 0x1f;
            // SPS is NAL type 7
            if (nalType === 7 && buf.length > i + 6) {
                const profileIdc = buf[i + 4];
                const constraintFlags = buf[i + 5];
                const levelIdc = buf[i + 6];
                const codec = `avc1.${profileIdc.toString(16).padStart(2, '0')}${constraintFlags.toString(16).padStart(2, '0')}${levelIdc.toString(16).padStart(2, '0')}`;
                console.debug(`[WebCodecs] SPS detected → codec=${codec} (profile=${profileIdc}, level=${levelIdc})`);
                return codec;
            }
            i += 4; // skip past this NAL header
        } else {
            i++;
        }
    }
    return null; // SPS not found in this packet
}

export const WebCodecsPlayer = ({ camera, onStateChange }) => {
    const { token } = useAuth();
    const cameraId = camera?.id;
    const canvasRef = useRef(null);
    const wsRef = useRef(null);
    const decoderRef = useRef(null);
    const isReadyRef = useRef(false);
    const configuredCodecRef = useRef(null);  // tracks currently configured codec string
    const pendingFramesRef = useRef([]);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef(null);
    const animFrameRef = useRef(null);
    const watchdogTimerRef = useRef(null);
    const isMountedRef = useRef(true);

    const [status, setStatus] = useState('connecting');

    useEffect(() => {
        if (onStateChange) onStateChange(status);
    }, [status, onStateChange]);

    const drawOverlay = useCallback((ctx, w, h) => {
        if (!camera) return;

        const userPreference = camera.text_scale || 1.0;
        const fontScale = Math.max(0.4, (w / 1200.0) * userPreference);
        const thickness = Math.max(1, Math.floor(fontScale * 2.0));

        // OpenCV FONT_HERSHEY_SIMPLEX base size at scale 1.0 is visually larger than 24px.
        // Increasing to 30px base to match the user's reported discrepancy.
        const fontSize = Math.floor(30 * fontScale);

        // Simplex is a thin stroke font. 500 for thickness 1, 700 for thickness 2+.
        ctx.font = `${thickness > 1 ? '700' : '500'} ${fontSize}px sans-serif`;

        const processText = (text) => {
            if (!text) return "";
            let processed = text.replace(/%\$/g, camera.name || '').replace(/%N/g, camera.name || '');
            if (processed.includes('%')) {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const replacements = {
                    '%Y': now.getFullYear(),
                    '%m': pad(now.getMonth() + 1),
                    '%d': pad(now.getDate()),
                    '%H': pad(now.getHours()),
                    '%M': pad(now.getMinutes()),
                    '%S': pad(now.getSeconds()),
                };
                Object.entries(replacements).forEach(([key, val]) => {
                    processed = processed.replace(new RegExp(key, 'g'), val);
                });
            }
            return processed;
        };

        // Text Left (Top Left)
        const textLeft = processText(camera.text_left || "");
        if (textLeft) {
            const metrics = ctx.measureText(textLeft);
            const textWidth = metrics.width;
            const textHeight = fontSize;
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, textWidth + 20, textHeight + 20);
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'top';
            ctx.fillText(textLeft, 10, 10);
        }

        // Text Right (Bottom Right)
        const textRight = processText(camera.text_right || "");
        if (textRight) {
            const metrics = ctx.measureText(textRight);
            const textWidth = metrics.width;
            const textHeight = fontSize;
            ctx.fillStyle = 'black';
            ctx.fillRect(w - textWidth - 20, h - textHeight - 20, textWidth + 20, textHeight + 20);
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(textRight, w - textWidth - 10, h - 10);
        }
    }, [camera]);

    // ── Render loop ───────────────────────────────────────────────────────────
    const scheduleRender = useCallback(() => {
        if (animFrameRef.current) return;
        animFrameRef.current = requestAnimationFrame(() => {
            animFrameRef.current = null;
            if (!isMountedRef.current || !canvasRef.current) {
                while (pendingFramesRef.current.length > 0) {
                    try { pendingFramesRef.current.shift().close(); } catch (_) { }
                }
                return;
            }
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
            const frames = pendingFramesRef.current;
            if (frames.length === 0) return;

            const frame = frames.shift();
            // DROP LOGIC: If we have a backlog (latency building up), 
            // drop EVERYTHING except a tiny cushion to stay near the "present"
            // while allowing for a little network jitter.
            const jitterBufferTarget = 2;
            if (frames.length > jitterBufferTarget) {
                // Keep the most recent frames, close the stale ones
                const staleCount = frames.length - jitterBufferTarget;
                const staleFrames = frames.splice(0, staleCount);
                for (const f of staleFrames) {
                    try { f.close(); } catch (_) { }
                }
            }

            const rotation = camera.rotation || 0;
            const drawW = frame.displayWidth;
            const drawH = frame.displayHeight;

            // Resize canvas to match the expected rotated output
            if (rotation === 90 || rotation === 270) {
                if (canvas.width !== drawH || canvas.height !== drawW) {
                    canvas.width = drawH;
                    canvas.height = drawW;
                    canvas.style.aspectRatio = `${drawH} / ${drawW}`;
                }
            } else {
                if (canvas.width !== drawW || canvas.height !== drawH) {
                    canvas.width = drawW;
                    canvas.height = drawH;
                    canvas.style.aspectRatio = `${drawW} / ${drawH}`;
                }
            }

            ctx.save();
            // Handle rotation
            if (rotation === 90) {
                ctx.translate(canvas.width, 0);
                ctx.rotate(Math.PI / 2);
            } else if (rotation === 180) {
                ctx.translate(canvas.width, canvas.height);
                ctx.rotate(Math.PI);
            } else if (rotation === 270) {
                ctx.translate(0, canvas.height);
                ctx.rotate(-Math.PI / 2);
            }

            ctx.drawImage(frame, 0, 0, drawW, drawH);
            ctx.restore();

            // Draw Client-side Overlay on top of the final rotated canvas
            drawOverlay(ctx, canvas.width, canvas.height);

            try { frame.close(); } catch (_) { }
        });
    }, [drawOverlay, camera.rotation]);

    // ── Decoder factory ───────────────────────────────────────────────────────
    // Returns a fresh, UNconfigured VideoDecoder. Configuration is deferred
    // until the first keyframe arrives and we know the real codec profile.
    const createDecoder = useCallback(() => {
        if (!('VideoDecoder' in window)) return null;
        try {
            const dec = new VideoDecoder({
                output: (frame) => {
                    if (!isMountedRef.current) { try { frame.close(); } catch (_) { } return; }
                    pendingFramesRef.current.push(frame);
                    scheduleRender();
                    // Signal 'loaded' on first rendered frame
                    setStatus(prev => prev !== 'loaded' ? 'loaded' : prev);
                },
                error: (e) => {
                    console.error('[WebCodecs] Decoder error:', e);
                    // Force re-detection on the next keyframe
                    configuredCodecRef.current = null;
                    isReadyRef.current = false;
                },
            });
            return dec;
        } catch (e) {
            console.error('[WebCodecs] Failed to create VideoDecoder:', e);
            return null;
        }
    }, [scheduleRender]);

    // Configure (or reconfigure) the decoder for a given codec string.
    // Creates a new decoder instance if needed (state machine can't go back to 'unconfigured').
    const ensureDecoderConfigured = useCallback((codec) => {
        if (configuredCodecRef.current === codec && decoderRef.current?.state === 'configured') {
            return true; // already configured correctly
        }

        // Close existing decoder if open
        if (decoderRef.current && decoderRef.current.state !== 'closed') {
            try { decoderRef.current.close(); } catch (_) { }
        }
        // Drain pending frames from old decoder
        while (pendingFramesRef.current.length > 0) {
            try { pendingFramesRef.current.shift().close(); } catch (_) { }
        }

        const dec = createDecoder();
        if (!dec) return false;
        decoderRef.current = dec;

        try {
            dec.configure({ codec, optimizeForLatency: true });
            configuredCodecRef.current = codec;
            console.debug(`[WebCodecs] Decoder configured with codec: ${codec}`);
            return true;
        } catch (e) {
            console.warn(`[WebCodecs] configure(${codec}) failed:`, e);
            // Fallback to Baseline
            if (codec !== 'avc1.42E01E') {
                try {
                    dec.configure({ codec: 'avc1.42E01E', optimizeForLatency: true });
                    configuredCodecRef.current = 'avc1.42E01E';
                    console.debug('[WebCodecs] Fell back to avc1.42E01E (Baseline)');
                    return true;
                } catch (e2) {
                    console.error('[WebCodecs] Baseline configure also failed:', e2);
                }
            }
            return false;
        }
    }, [createDecoder]);

    // ── Cleanup helpers ───────────────────────────────────────────────────────
    const closeWS = useCallback(() => {
        if (!wsRef.current) return;
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        try { ws.close(); } catch (_) { }
    }, []);

    const closeDecoder = useCallback(() => {
        if (decoderRef.current && decoderRef.current.state !== 'closed') {
            try { decoderRef.current.close(); } catch (_) { }
        }
        decoderRef.current = null;
        configuredCodecRef.current = null;
        isReadyRef.current = false;
        while (pendingFramesRef.current.length > 0) {
            try { pendingFramesRef.current.shift().close(); } catch (_) { }
        }
    }, []);

    // ── Main connect function ─────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!isMountedRef.current) return;
        if (!cameraId) return;

        if (!('VideoDecoder' in window)) {
            console.warn('[WebCodecs] VideoDecoder API not available.');
            setStatus('unsupported');
            return;
        }

        closeWS();
        closeDecoder();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const tokenPart = token ? `?token=${encodeURIComponent(token)}` : '';
        const wsUrl = `${protocol}//${window.location.host}/api/cameras/${cameraId}/ws${tokenPart}`;

        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[WebCodecs] WebSocket construction failed:', e);
            setStatus('error');
            return;
        }
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.debug(`[WebCodecs] WS connected for camera ${cameraId}`);
            retryCountRef.current = 0;
        };

        ws.onmessage = (event) => {
            if (!isMountedRef.current) return;

            const watchdogTimeout = 10000;
            if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = setTimeout(() => {
                if (isMountedRef.current && status === 'loaded') {
                    console.warn(`[WebCodecs] No frames received for ${cameraId} in 10s. Resetting status to connecting.`);
                    setStatus('connecting');
                }
            }, watchdogTimeout);

            const buffer = event.data;
            if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 10) return;

            try {
                const view = new DataView(buffer);
                const isKeyframe = view.getUint8(0) === 1;
                const tsSec = view.getFloat64(1, true); // little-endian
                const tsUs = Math.floor(tsSec * 1_000_000);
                const naluBytes = new Uint8Array(buffer, 9);

                // Wait for the first I-frame before starting to decode
                if (!isReadyRef.current) {
                    if (!isKeyframe) return;
                    isReadyRef.current = true;
                }

                // ── Deferred codec configuration ──
                // On every keyframe, try to find the real codec from the SPS NAL.
                // This correctly handles cameras that stream Main (4d) or High (64) profile.
                if (isKeyframe) {
                    const detected = detectCodecFromSPS(naluBytes);
                    const codec = detected || 'avc1.42E01E';
                    if (!ensureDecoderConfigured(codec)) {
                        console.error('[WebCodecs] Cannot configure decoder — aborting.');
                        setStatus('error');
                        return;
                    }
                }

                if (!decoderRef.current || decoderRef.current.state !== 'configured') return;

                decoderRef.current.decode(new EncodedVideoChunk({
                    type: isKeyframe ? 'key' : 'delta',
                    timestamp: tsUs,
                    data: naluBytes,
                    duration: 0,
                }));

            } catch (err) {
                console.error('[WebCodecs] Packet handling error:', err);
            }
        };

        ws.onerror = () => {
            // onclose always fires after onerror — retry logic lives there
            console.warn(`[WebCodecs] WS error for camera ${cameraId}`);
        };

        ws.onclose = (e) => {
            if (!isMountedRef.current) return;
            console.debug(`[WebCodecs] WS closed for camera ${cameraId}, code=${e.code}`);

            if (e.code === 1008) {
                setStatus('unauthorized');
                return;
            }

            const attempt = retryCountRef.current;
            if (attempt < MAX_RETRIES) {
                const delay = Math.min(RETRY_BASE_MS * (2 ** attempt), 30_000);
                retryCountRef.current += 1;
                console.debug(`[WebCodecs] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms…`);
                setStatus('connecting');
                retryTimerRef.current = setTimeout(() => {
                    if (isMountedRef.current) connect();
                }, delay);
            } else {
                console.warn(`[WebCodecs] Exhausted retries for camera ${cameraId}. Triggering MJPEG fallback.`);
                setStatus('error');
            }
        };

    }, [cameraId, token, closeWS, closeDecoder, ensureDecoderConfigured]);

    // ── Mount / unmount ───────────────────────────────────────────────────────
    useEffect(() => {
        isMountedRef.current = true;
        retryCountRef.current = 0;
        connect();

        return () => {
            isMountedRef.current = false;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            closeWS();
            closeDecoder();
        };
    }, [cameraId, token]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
                display: status === 'loaded' ? 'block' : 'none',
                objectFit: 'contain'
            }}
        />
    );
};
