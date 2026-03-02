import React, { useState, useEffect } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, Plus, Globe, Shield, ShieldAlert, ChevronRight, Filter, Info } from 'lucide-react';
import { Button } from './ui/Button';
import { InputField } from './ui/FormControls';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const CameraScanner = ({ onAddCamera, existingCameras = [] }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [ipRange, setIpRange] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [results, setResults] = useState([]);
    const [probingDevice, setProbingDevice] = useState(null);
    const [isDeepScanning, setIsDeepScanning] = useState(false);
    const [credentials, setCredentials] = useState({ user: 'admin', password: '' });
    const [scannerCredentials, setScannerCredentials] = useState({ user: 'admin', password: '' });
    const [deepScanningIps, setDeepScanningIps] = useState(new Set());
    const [progress, setProgress] = useState(null); // { current, total, percent, ip }
    const [showAllDevices, setShowAllDevices] = useState(false);
    const [scanTimeout, setScanTimeout] = useState(2.0);
    const [maxRetries, setMaxRetries] = useState(2);
    const [abortController, setAbortController] = useState(null);

    // Default filters out potential_onvif devices that don't have RTSP open
    const filteredResults = results.filter(dev => {
        if (showAllDevices) return true;
        if (dev.status === 'onvif_confirmed' || dev.status === 'rtsp_only' || dev.rtsp_open) return true;
        return false;
    });

    const isAlreadyAdded = (ip) => {
        return existingCameras.some(cam =>
            cam.rtsp_url && (cam.rtsp_url.includes(`@${ip}:`) || cam.rtsp_url.includes(`@${ip}/`))
        );
    };

    // Auto-deep scan effect
    useEffect(() => {
        const potentialCameras = results.filter(d =>
            d.status === 'rtsp_only' && !d.manufacturer && !deepScanningIps.has(d.ip)
        );

        potentialCameras.forEach(dev => {
            setDeepScanningIps(prev => new Set([...prev, dev.ip]));
            handleDeepScan(dev);
        });
    }, [results]);

    const handleScan = async (e) => {
        e.preventDefault();
        if (!ipRange) {
            showToast("Please enter an IP range (e.g. 192.168.1.0/24)", "error");
            return;
        }
        setIsScanning(true);
        setResults([]);
        setProgress({ current: 0, total: 0, percent: 0, ip: '' });

        const controller = new AbortController();
        setAbortController(controller);

        const ipRangeQuery = encodeURIComponent(ipRange);

        try {
            const response = await fetch(`/api/onvif/scan/stream?ip_range=${ipRangeQuery}&timeout=${scanTimeout}&retries=${maxRetries}`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'text/event-stream',
                    'Authorization': `Bearer ${token}`,
                    'x-scanner-user': scannerCredentials.user || '',
                    'x-scanner-password': scannerCredentials.password || ''
                }
            });

            if (!response.ok) throw new Error("Scan failed to start");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmedLine.replace('data: ', '').trim());

                        // Handle events
                        if (data.total !== undefined && data.current === undefined) {
                            // This is a start event
                            setProgress(prev => ({ ...prev, total: data.total }));
                        } else if (data.total !== undefined && data.current !== undefined) {
                            // This is a progress event
                            setProgress(data);
                        } else if (data.ip && data.status) {
                            // This is a result event
                            setResults(prev => {
                                // Prevent duplicates for same IP
                                if (prev.some(r => r.ip === data.ip)) return prev;
                                return [...prev, data];
                            });
                        }
                    } catch (e) {
                        console.error("Error parsing scan event:", e, trimmedLine);
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                showToast("Scan cancelled by user.", "info");
            } else {
                showToast("Scan failed: " + err.message, "error");
            }
        } finally {
            setIsScanning(false);
            setAbortController(null);
        }
    };

    const handleStopScan = (e) => {
        if (e) e.preventDefault();
        if (abortController) {
            abortController.abort();
        }
    };

    const handleDeepScan = async (device) => {
        setIsDeepScanning(true);
        showToast(`Scanning extended ports for ${device.ip}...`, "info");
        try {
            const response = await fetch('/api/onvif/deep-scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ip: device.ip })
            });

            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();

            if (data.length > 0) {
                // Update results list: replace the item or add new ones
                setResults(prev => {
                    const existing = prev.find(d => d.ip === device.ip);
                    const filtered = prev.filter(d => d.ip !== device.ip);

                    // If the deep scan returned a fallback (port 0) but we already had a port, preserve it
                    const enriched = data.map(item => ({
                        ...item,
                        port: (item.port === 0 && existing && existing.port !== 0) ? existing.port : item.port,
                        deepScanDone: true
                    }));

                    return [...filtered, ...enriched];
                });
                showToast(`Scan for ${device.ip} finished`, "info");
            } else {
                showToast(`No ONVIF services found on any port for ${device.ip}`, "warning");
                setResults(prev => prev.map(d => d.ip === device.ip ? { ...d, deepScanDone: true } : d));
            }
        } catch (err) {
            showToast("Deep scan failed: " + err.message, "error");
            setResults(prev => prev.map(d => d.ip === device.ip ? { ...d, deepScanDone: true } : d));
        } finally {
            setIsDeepScanning(false);
        }
    };

    const handleProbe = async (device) => {
        // Ensure we have a valid port for the modal state
        const port = (!device.port || device.port === 0) ? 80 : device.port;

        // Sync credentials from scanner to probing modal for convenience
        setCredentials(scannerCredentials);

        setProbingDevice({ ...device, port, step: 'credentials' });
    };

    const runProbe = async () => {
        setProbingDevice(prev => ({ ...prev, step: 'probing' }));
        try {
            const response = await fetch('/api/onvif/probe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ip: probingDevice.ip,
                    port: parseInt(probingDevice.port) || 80,
                    user: credentials.user,
                    password: credentials.password
                })
            });

            if (!response.ok) throw new Error(await response.text());
            const details = await response.json();
            setProbingDevice({ ...details, step: 'success' });
        } catch (err) {
            let msg = err.message;
            try {
                // If the error response is JSON, extract the detail
                const errorObj = JSON.parse(err.message);
                if (errorObj.detail) msg = errorObj.detail;
            } catch (e) { }

            showToast("Probe failed: " + msg, "error");
            setProbingDevice(prev => ({ ...prev, step: 'credentials' }));
        }
    };

    const selectProfile = (profile) => {
        onAddCamera({
            name: `${probingDevice.manufacturer} ${probingDevice.model || 'Camera'}`,
            rtsp_url: profile.url.replace('rtsp://', `rtsp://${credentials.user}:${credentials.password}@`),
            rtsp_username: credentials.user,
            rtsp_password: credentials.password,
            rtsp_host: probingDevice.ip + (probingDevice.port && probingDevice.port !== 80 ? `:${probingDevice.port}` : '') + profile.url.split(':').pop().split('/').slice(1).join('/'), // This is complex, but we basically want the path
            // Simpler approach: just pass the components and let the parent handle it
            ip: probingDevice.ip,
            port: probingDevice.port,
            path: profile.url.split(probingDevice.ip).pop().split(':').pop().replace(/^\d+/, ''), // Extract path after port
            location: '' // Per user request: location is not the IP
        });
        setProbingDevice(null);
    };

    return (
        <div className="bg-card border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border bg-muted/5">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Globe className="w-5 h-5 text-primary" />
                    Network Camera Scanner
                </h3>
                <form onSubmit={handleScan} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-1">
                            <InputField
                                label="IP Range (CIDR or Range)"
                                placeholder="e.g. 192.168.1.0/24"
                                value={ipRange}
                                onChange={(val) => setIpRange(val)}
                                disabled={isScanning}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:col-span-2">
                            <InputField
                                label="Scanner User"
                                value={scannerCredentials.user}
                                onChange={(val) => setScannerCredentials(prev => ({ ...prev, user: val }))}
                                disabled={isScanning}
                            />
                            <InputField
                                label="Scanner Password"
                                type="password"
                                value={scannerCredentials.password}
                                onChange={(val) => setScannerCredentials(prev => ({ ...prev, password: val }))}
                                disabled={isScanning}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:col-span-3">
                            <InputField
                                label="Timeout (Seconds)"
                                type="number"
                                min="0.5"
                                max="10"
                                step="0.5"
                                value={scanTimeout}
                                onChange={(val) => setScanTimeout(parseFloat(val))}
                                disabled={isScanning}
                                helperText="Wait time per port. Increase for slow WiFi."
                            />
                            <InputField
                                label="Max Retries"
                                type="number"
                                min="0"
                                max="5"
                                step="1"
                                value={maxRetries}
                                onChange={(val) => setMaxRetries(parseInt(val, 10))}
                                disabled={isScanning}
                                helperText="Attempts per port on failure."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-2">
                        {isScanning ? (
                            <Button
                                type="button"
                                variant="destructive"
                                className="h-[42px] px-8"
                                onClick={handleStopScan}
                            >
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Stop Scan
                            </Button>
                        ) : (
                            <Button type="submit" className="h-[42px] px-8">
                                <Search className="w-4 h-4 mr-2" />
                                Scan Network
                            </Button>
                        )}
                    </div>
                </form>
            </div>

            <div className="p-4 max-h-[400px] overflow-y-auto">
                {results.length === 0 && !isScanning && (
                    <div className="text-center py-10 text-muted-foreground">
                        <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Enter a range and scan to find cameras</p>
                    </div>
                )}

                {isScanning && progress && (
                    <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                <span className="text-sm font-medium text-foreground">
                                    Scanning Network...
                                </span>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full border border-border/50">
                                {progress.current} / {progress.total} IPs
                            </span>
                        </div>

                        <div className="relative h-2.5 w-full bg-secondary/30 rounded-full overflow-hidden border border-border/20">
                            <div
                                className="absolute top-0 left-0 h-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>

                        <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-muted-foreground font-mono">
                                Checking {progress.ip || '...'}
                            </span>
                            <span className="text-[10px] font-bold text-primary">
                                {progress.percent}%
                            </span>
                        </div>
                    </div>
                )}

                {results.length > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        {!isScanning && progress && progress.current === progress.total && (
                            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                                <Info className="w-4 h-4" />
                                <span>Found <strong>{filteredResults.length}</strong> viable cameras out of {progress.total} scanned IPs.</span>
                            </div>
                        )}
                        <Button
                            variant={showAllDevices ? "secondary" : "ghost"}
                            size="sm"
                            className="text-xs h-8 ml-auto"
                            onClick={() => setShowAllDevices(!showAllDevices)}
                        >
                            <Filter className="w-3.5 h-3.5 mr-1.5" />
                            {showAllDevices ? "Showing All Devices" : "Show Unverified Devices"}
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                    {filteredResults.map((dev, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors group gap-4">
                            <div className="flex items-start sm:items-center gap-3">
                                <div className={`p-2 rounded-lg shrink-0 ${dev.auth_required ? 'bg-amber-100 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                                    {dev.auth_required ? <ShieldAlert className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium truncate">{dev.ip}:{dev.port || '???'}</p>
                                        <div className="flex gap-1">
                                            {dev.rtsp_open && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-bold">RTSP</span>}
                                            {dev.manufacturer && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-bold">ONVIF</span>}
                                            {isAlreadyAdded(dev.ip) && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold flex items-center gap-1 shadow-sm">
                                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                                    Added
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {dev.manufacturer ? `${dev.manufacturer} ${dev.model}` :
                                            dev.rtsp_open ? "Potential Camera (RTSP Open)" :
                                                "Potential ONVIF Device"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 sm:gap-1">
                                {dev.status === 'rtsp_only' && !dev.manufacturer && !dev.deepScanDone && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg text-[10px] text-muted-foreground animate-pulse border border-border/50">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>Searching ports...</span>
                                    </div>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleProbe(dev)}>
                                    <ChevronRight className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Probing Modal Overlay */}
            {probingDevice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border-2 border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-border flex justify-between items-center">
                            <h4 className="font-semibold text-lg">Probe Device: {probingDevice.ip}</h4>
                            <Button variant="ghost" size="icon" onClick={() => setProbingDevice(null)}><X className="w-5 h-5" /></Button>
                        </div>

                        <div className="p-6">
                            {probingDevice.step === 'credentials' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground mb-4">Enter ONVIF credentials for this device to retrieve stream profiles.</p>

                                    {(!probingDevice.manufacturer || probingDevice.status === 'rtsp_only') && (
                                        <InputField
                                            label="ONVIF Port"
                                            type="number"
                                            value={probingDevice.port}
                                            onChange={(val) => setProbingDevice({ ...probingDevice, port: parseInt(val) || 0 })}
                                            help="The port used for ONVIF communication (often 80, 8080, 8000, 8899)"
                                        />
                                    )}

                                    <InputField
                                        label="Username"
                                        value={credentials.user}
                                        onChange={(val) => setCredentials({ ...credentials, user: val })}
                                    />
                                    <InputField
                                        label="Password"
                                        type="password"
                                        value={credentials.password}
                                        onChange={(val) => setCredentials({ ...credentials, password: val })}
                                    />
                                    <Button onClick={runProbe} className="w-full mt-4">Connect & Probe</Button>
                                </div>
                            )}

                            {probingDevice.step === 'probing' && (
                                <div className="text-center py-10">
                                    <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
                                    <p>Retrieving device information and profiles...</p>
                                </div>
                            )}

                            {probingDevice.step === 'success' && (
                                <div className="space-y-4">
                                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/20 mb-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            <span className="font-semibold">{probingDevice.manufacturer} {probingDevice.model}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground ml-8">Found {probingDevice.profiles.length} stream profiles.</p>
                                    </div>

                                    <p className="text-sm font-medium mb-2">Select a profile to import:</p>
                                    <div className="space-y-2">
                                        {probingDevice.profiles.map((p, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => selectProfile(p)}
                                                className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 cursor-pointer transition-all group"
                                            >
                                                <div>
                                                    <p className="font-medium text-sm group-hover:text-primary">{p.name}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{p.url.split('@').pop()}</p>
                                                </div>
                                                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const X = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);
