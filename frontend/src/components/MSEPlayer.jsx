import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Volume2 } from 'lucide-react';
import JMuxer from 'jmuxer';

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1500;

/**
 * G.711 A-law to 16-bit PCM decoder
 */
function alaw2linear(alaw) {
    alaw ^= 0x55;
    let sign = (alaw & 0x80) ? -1 : 1;
    let exponent = (alaw & 0x70) >> 4;
    let mantissa = alaw & 0x0f;
    let sample = 0;
    if (exponent === 0) {
        sample = (mantissa << 4) + 8;
    } else {
        sample = (mantissa << 4) + 0x108;
        sample <<= (exponent - 1);
    }
    return (sign * sample) / 32768.0; // Normalize to -1.0..1.0 for Web Audio
}

export const MSEPlayer = ({ camera, onStateChange, videoEnabled = true, isAuditing }) => {
    const { token } = useAuth();
    const cameraId = camera?.id;
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const wsRef = useRef(null);
    const jmuxerRef = useRef(null);
    const isReadyRef = useRef(false);
    
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef(null);
    const watchdogTimerRef = useRef(null);
    const isMountedRef = useRef(true);
    
    // Metadata / Overlays
    const latestMetadataRef = useRef([]);
    const metadataTimeRef = useRef(0);
    const animFrameRef = useRef(null);

    // Metadata-only mode
    const metadataOnlyRef = useRef(false);

    // Audio Refs
    const audioCtxRef = useRef(null);
    const audioStartTimeRef = useRef(0);
    const isAuditingRef = useRef(isAuditing);

    const [status, setStatus] = useState('connecting');

    useEffect(() => {
        isAuditingRef.current = isAuditing;
    }, [isAuditing]);

    useEffect(() => {
        if (onStateChange) onStateChange(status);
    }, [status, onStateChange]);

    const drawOverlay = useCallback((ctx, w, h) => {
        if (!camera) return;
        const userPreference = camera.text_scale || 1.0;
        const fontScale = Math.max(0.4, (w / 1200.0) * userPreference);
        const thickness = Math.max(1, Math.floor(fontScale * 2.0));
        const fontSize = Math.floor(30 * fontScale);
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

        const textLeft = processText(camera.text_left || "");
        if (textLeft) {
            const metrics = ctx.measureText(textLeft);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, metrics.width + 20, fontSize + 20);
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'top';
            ctx.fillText(textLeft, 10, 10);
        }

        const textRight = processText(camera.text_right || "");
        if (textRight) {
            const metrics = ctx.measureText(textRight);
            ctx.fillStyle = 'black';
            ctx.fillRect(w - metrics.width - 20, h - fontSize - 20, metrics.width + 20, fontSize + 20);
            ctx.fillStyle = 'white';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(textRight, w - metrics.width - 10, h - 10);
        }
    }, [camera]);

    const drawAIBoxes = useCallback((ctx, w, h) => {
        const metadata = latestMetadataRef.current;
        const now = Date.now();
        if (!metadata || metadata.length === 0 || (now - metadataTimeRef.current > 1500)) return;

        metadata.forEach(res => {
            try {
                const label = res.label || 'unknown';
                const conf = res.confidence || 0.0;
                const box = res.box || [0, 0, 0, 0];
                
                let color = '#00FF00';
                if (label === 'person') color = '#00FF00';
                else if (['vehicle', 'car', 'bus', 'truck'].includes(label)) color = '#0000FF';
                else if (['dog', 'cat', 'bird'].includes(label)) color = '#FFA500';
                
                const [ymin, xmin, ymax, xmax] = box;
                const x1 = xmin * w;
                const y1 = ymin * h;
                const bw = (xmax - xmin) * w;
                const bh = (ymax - ymin) * h;

                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(2, w / 400);
                ctx.strokeRect(x1, y1, bw, bh);

                const text = `${label.charAt(0).toUpperCase() + label.slice(1)} ${Math.round(conf * 100)}%`;
                const fontSize = Math.floor(20 * Math.max(0.4, w / 1200));
                ctx.font = `bold ${fontSize}px sans-serif`;
                
                const padding = 4;
                ctx.fillStyle = color;
                let labelY = y1 - fontSize - (padding * 2);
                if (labelY < 0) labelY = y1;

                ctx.fillRect(x1, labelY, ctx.measureText(text).width + (padding * 2), fontSize + (padding * 2));
                ctx.fillStyle = 'black';
                ctx.textBaseline = 'top';
                ctx.fillText(text, x1 + padding, labelY + padding);
            } catch (e) {
                console.warn('[MSEPlayer] Error drawing box:', e);
            }
        });
    }, []);

    const scheduleRender = useCallback(() => {
        if (animFrameRef.current) return;
        animFrameRef.current = requestAnimationFrame(() => {
            animFrameRef.current = null;
            if (!isMountedRef.current || !canvasRef.current || !videoRef.current) return;

            const canvas = canvasRef.current;
            const video = videoRef.current;

            // Sync canvas size to video rendering size (or parent container if metadata-only)
            const parent = canvas.parentElement;
            if (metadataOnlyRef.current) {
                canvas.width = parent?.clientWidth || 640;
                canvas.height = parent?.clientHeight || 480;
            } else {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
                        canvas.width = video.clientWidth;
                        canvas.height = video.clientHeight;
                    }
                }
            }

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            drawAIBoxes(ctx, canvas.width, canvas.height);
            drawOverlay(ctx, canvas.width, canvas.height);
        });
    }, [drawOverlay, drawAIBoxes]);

    // Metadata overlay render loop interval
    useEffect(() => {
        const interval = setInterval(scheduleRender, 100);
        return () => clearInterval(interval);
    }, [scheduleRender]);

    const initAudio = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 8000
            });
            audioStartTimeRef.current = 0;
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    }, []);

    const playAudioChunk = useCallback((pcmData) => {
        if (!audioCtxRef.current || !isAuditingRef.current) return;
        
        const ctx = audioCtxRef.current;
        const buffer = ctx.createBuffer(1, pcmData.length, ctx.sampleRate);
        buffer.getChannelData(0).set(pcmData);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        const currentTime = ctx.currentTime;
        const drift = audioStartTimeRef.current - currentTime;
        
        if (drift > 0.3 || audioStartTimeRef.current < currentTime) {
            audioStartTimeRef.current = currentTime + 0.05;
        }
        
        source.start(audioStartTimeRef.current);
        audioStartTimeRef.current += buffer.duration;
    }, []);

    useEffect(() => {
        if (isAuditing) {
            if (!audioCtxRef.current) initAudio();
            else if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        } else {
            if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
                audioCtxRef.current.suspend();
            }
        }
    }, [isAuditing, initAudio]);

    const closeWS = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.onopen = wsRef.current.onclose = wsRef.current.onerror = wsRef.current.onmessage = null;
            try { wsRef.current.close(); } catch (_) { }
            wsRef.current = null;
        }
    }, []);

    const initJMuxer = useCallback(() => {
        if (jmuxerRef.current) {
            try { jmuxerRef.current.destroy(); } catch (_) {}
        }
        if (!videoRef.current) return;
        
        try {
            jmuxerRef.current = new JMuxer({
                node: videoRef.current,
                mode: 'video', // We only feed video via JMuxer, audio is handled via WebAudio
                flushingTime: 0,
                clearBuffer: false,
                debug: false,
                onError: (e) => {
                    console.error('[MSEPlayer] JMuxer error:', e);
                    setStatus('error');
                }
            });
        } catch (e) {
            console.error('[MSEPlayer] Failed to init JMuxer:', e);
            setStatus('unsupported');
        }
    }, []);

    const connect = useCallback(() => {
        if (!isMountedRef.current || !cameraId) return;
        metadataOnlyRef.current = !videoEnabled;

        if (!window.MediaSource) {
            console.warn('[MSEPlayer] MediaSource not supported in this browser.');
            setStatus('unsupported');
            return;
        }

        closeWS();
        initJMuxer();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const tokenPart = token ? `?token=${encodeURIComponent(token)}` : '';
        const wsUrl = `${protocol}//${window.location.host}/api/cameras/${cameraId}/ws${tokenPart}`;

        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[MSEPlayer] WS init failed:', e);
            setStatus('error');
            return;
        }
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.debug(`[MSEPlayer] Connected for camera ${cameraId}`);
            retryCountRef.current = 0;
            isReadyRef.current = false;
        };

        ws.onmessage = (event) => {
            if (!isMountedRef.current) return;

            if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = setTimeout(() => {
                if (isMountedRef.current && status === 'loaded') {
                    console.warn(`[MSEPlayer] Watchdog timeout for ${cameraId}`);
                    setStatus('connecting');
                }
            }, 30000);

            const buffer = event.data;
            if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 11) return;

            try {
                const view = new DataView(buffer);
                const pType = view.getUint8(0);
                const isKeyframe = view.getUint8(1) === 1;
                
                if (pType === 0 && videoEnabled && jmuxerRef.current) { // VIDEO
                    const naluBytes = new Uint8Array(buffer, 10);
                    if (!isReadyRef.current) {
                        if (!isKeyframe) return; // Wait for first keyframe
                        isReadyRef.current = true;
                        setStatus('loaded');
                    }
                    // JMuxer parses H.264 NAL units (requires annex B start codes which VibeNVR provides)
                    jmuxerRef.current.feed({ video: naluBytes });
                } else if (pType === 1) { // AUDIO
                    if (!videoEnabled) return;
                    const pcmALaw = new Uint8Array(buffer, 10);
                    const pcmLinear = new Float32Array(pcmALaw.length);
                    for (let i = 0; i < pcmALaw.length; i++) {
                        pcmLinear[i] = alaw2linear(pcmALaw[i]);
                    }
                    try { playAudioChunk(pcmLinear); } catch (_) {}
                } else if (pType === 2) { // METADATA
                    const jsonStr = new TextDecoder().decode(new Uint8Array(buffer, 10));
                    try {
                        latestMetadataRef.current = JSON.parse(jsonStr);
                        metadataTimeRef.current = Date.now();
                        scheduleRender();
                    } catch (_) {}
                }
            } catch (err) {
                console.error('[MSEPlayer] WS message error:', err);
            }
        };

        ws.onclose = (e) => {
            if (!isMountedRef.current) return;
            if (e.code === 1008) {
                setStatus('unauthorized');
                return;
            }
            if (metadataOnlyRef.current) {
                retryTimerRef.current = setTimeout(() => { if (isMountedRef.current) connect(); }, 2000);
                return;
            }
            const attempt = retryCountRef.current;
            if (attempt < MAX_RETRIES) {
                const delay = Math.min(RETRY_BASE_MS * (2 ** attempt), 30_000);
                retryCountRef.current++;
                setStatus('connecting');
                retryTimerRef.current = setTimeout(() => { if (isMountedRef.current) connect(); }, delay);
            } else {
                setStatus('error');
            }
        };
    }, [cameraId, token, videoEnabled, closeWS, initJMuxer, scheduleRender, playAudioChunk]);

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
            if (jmuxerRef.current) {
                try { jmuxerRef.current.destroy(); } catch (_) {}
            }
        };
    }, [connect, closeWS]);

    const showVideo = videoEnabled && !metadataOnlyRef.current && (status === 'loaded' || status === 'connecting');

    return (
        <div className={`absolute inset-0 ${metadataOnlyRef.current ? 'z-10 pointer-events-none' : ''}`}>
            {showVideo && (
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-contain"
                />
            )}
            
            {/* OSD Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            
            {camera.audio_enabled && status === 'loaded' && isAuditing && (
                <div className="absolute top-2 right-2 z-50 p-2 bg-primary/20 backdrop-blur-md rounded-full border border-primary/30 animate-in fade-in zoom-in duration-300">
                    <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                </div>
            )}
        </div>
    );
};
