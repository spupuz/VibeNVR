import React, { useState } from 'react';
import { InputField, SectionHeader } from '../../../ui/FormControls';
import { useAuth } from '../../../../contexts/AuthContext';
import { useToast } from '../../../../contexts/ToastContext';
import { Settings, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '../../../ui/Button';

export const OnvifTab = ({ newCamera, setNewCamera }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [probing, setProbing] = useState(false);
    const [probeStatus, setProbeStatus] = useState(null); // 'success' | 'error'
    const [probeResult, setProbeResult] = useState(null);

    const handleProbe = async () => {
        if (!newCamera.onvif_host) {
            showToast('Please enter an ONVIF Host IP', 'error');
            return;
        }

        setProbing(true);
        setProbeStatus(null);
        try {
            const res = await fetch('/api/onvif/probe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ip: newCamera.onvif_host,
                    port: newCamera.onvif_port || 80,
                    user: newCamera.onvif_username || '',
                    password: newCamera.onvif_password || ''
                })
            });

            if (res.ok) {
                const data = await res.json();
                setProbeStatus('success');
                setProbeResult(data);
                showToast(`Connected to ${data.manufacturer} ${data.model}`, 'success');
                
                // Automatically update camera capabilities based on probe result
                if (data.features) {
                    setNewCamera(prev => ({
                        ...prev,
                        ptz_can_pan_tilt: data.features.ptz_can_pan_tilt,
                        ptz_can_zoom: data.features.ptz_can_zoom,
                        ptz_can_home: data.features.ptz_can_home,
                        onvif_can_events: data.features.onvif_can_events,
                        audio_enabled: data.features.audio_enabled
                    }));
                }
            } else {
                setProbeStatus('error');
                const err = await res.json();
                showToast(err.detail || 'Connection failed', 'error');
            }
        } catch (err) {
            setProbeStatus('error');
            showToast('Network error during probe', 'error');
        } finally {
            setProbing(false);
        }
    };

    return (
        <div className="space-y-6">
            <SectionHeader 
                title="ONVIF Management" 
                description="Configure management connection for PTZ and advanced features" 
            />

            <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-3">
                        <InputField
                            label="ONVIF Host / IP"
                            value={newCamera.onvif_host}
                            onChange={(val) => setNewCamera({ ...newCamera, onvif_host: val })}
                            placeholder="192.168.1.100"
                            help="IP address used for ONVIF management (often same as camera IP)"
                        />
                    </div>
                    <InputField
                        label="Port"
                        type="number"
                        value={newCamera.onvif_port}
                        onChange={(val) => setNewCamera({ ...newCamera, onvif_port: val })}
                        placeholder="80"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField
                        label="ONVIF Username"
                        value={newCamera.onvif_username}
                        onChange={(val) => setNewCamera({ ...newCamera, onvif_username: val })}
                        placeholder="admin"
                    />
                    <InputField
                        label="ONVIF Password"
                        type="password"
                        showPasswordToggle
                        value={newCamera.onvif_password}
                        onChange={(val) => setNewCamera({ ...newCamera, onvif_password: val })}
                        placeholder="••••••"
                    />
                </div>
                <div className="pt-2 flex items-center justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleProbe}
                        disabled={probing}
                        className="w-full sm:w-auto"
                    >
                        {probing ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Settings className="w-4 h-4 mr-2" />
                        )}
                        Test ONVIF Connection
                    </Button>

                    {probeStatus === 'success' && (
                        <div className="flex items-center gap-2 text-xs text-green-500 font-medium">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Connection Verified</span>
                        </div>
                    )}
                    {probeStatus === 'error' && (
                        <div className="flex items-center gap-2 text-xs text-red-500 font-medium">
                            <ShieldAlert className="w-4 h-4" />
                            <span>Connection Failed</span>
                        </div>
                    )}
                </div>
            </div>

            {probeStatus === 'success' && probeResult && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 bg-muted/20 rounded-lg border border-border">
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Detected Capabilities</h5>
                        <div className="flex flex-wrap gap-2">
                            {probeResult.features?.ptz_can_pan_tilt && (
                                <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 text-[10px] font-bold rounded-md border border-indigo-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Pan/Tilt
                                </span>
                            )}
                            {probeResult.features?.ptz_can_zoom && (
                                <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-bold rounded-md border border-blue-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Zoom
                                </span>
                            )}
                            {probeResult.features?.ptz_can_home && (
                                <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-md border border-green-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Home Position
                                </span>
                            )}
                            {probeResult.features?.onvif_can_events && (
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-md border border-amber-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Edge Events
                                </span>
                            )}
                            {probeResult.features?.audio_enabled && (
                                <span className="px-2 py-1 bg-pink-500/10 text-pink-500 text-[10px] font-bold rounded-md border border-pink-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Audio
                                </span>
                            )}
                            {!Object.values(probeResult.features || {}).some(v => v) && (
                                <span className="text-[10px] text-muted-foreground italic">No advanced features detected</span>
                            )}
                        </div>
                    </div>

                    {probeResult.profiles?.length > 0 && (
                        <div className="p-4 bg-muted/20 rounded-lg border border-border">
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Detected Stream Profiles</h5>
                            <div className="space-y-2">
                                {probeResult.profiles.map((profile, idx) => (
                                    <div key={idx} className="flex flex-col gap-1 p-2 bg-background/50 rounded border border-border/50">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold">{profile.name}</span>
                                            <span className="text-[9px] text-muted-foreground opacity-50 font-mono">{profile.token}</span>
                                        </div>
                                        <div className="text-[9px] text-muted-foreground truncate font-mono bg-muted/30 p-1 rounded">
                                            {profile.url}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                <h5 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                    <Settings className="w-3 h-3" />
                    Why configure ONVIF?
                </h5>
                <ul className="text-xs space-y-2 text-muted-foreground list-disc pl-4">
                    <li>Enable real-time Pan, Tilt, and Zoom controls directly from the dashboard.</li>
                    <li>Enable <strong>ONVIF Edge Motion Detection</strong> to offload processing to camera hardware, drastically reducing NVR server CPU usage.</li>
                    <li>Higher detection accuracy by utilizing the camera's native sensor-level analytics.</li>
                </ul>
            </div>
        </div>
    );
};
