import React, { useState, useEffect } from 'react';
import { InputField, SectionHeader } from '../../../ui/FormControls';
import { useAuth } from '../../../../contexts/AuthContext';
import { useToast } from '../../../../contexts/ToastContext';
import { Settings, ShieldCheck, ShieldAlert, Loader2, Crosshair, Wand2 } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { parseRtspUrl } from '../../../../utils/cameraUtils';
import { useTranslation } from 'react-i18next';

export const OnvifTab = ({ newCamera, setNewCamera }) => {
  const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();
    const [probing, setProbing] = useState(false);
    const [probingPort, setProbingPort] = useState(false);
    const [probeStatus, setProbeStatus] = useState(null); // 'success' | 'error'
    const [probeResult, setProbeResult] = useState(null);

    // Auto-fill ONVIF details from RTSP URL if empty
    useEffect(() => {
        const hasHost = newCamera.onvif_host && newCamera.onvif_host.trim() !== '';
        if (!hasHost && newCamera.rtsp_url) {
            console.log("OnvifTab: Auto-filling from RTSP URL...");
            const { user, pass, host } = parseRtspUrl(newCamera.rtsp_url);
            // Extract IP/Host from RTSP host (which might include port)
            const IPOnly = host?.split(':')[0];
            
            if (IPOnly) {
                setNewCamera(prev => ({
                    ...prev,
                    onvif_host: prev.onvif_host || IPOnly,
                    onvif_username: prev.onvif_username || user,
                    onvif_password: prev.onvif_password || pass
                }));
            }
        }
    }, [newCamera.rtsp_url, newCamera.onvif_host, setNewCamera]);

    const handlePortProbe = async () => {
        if (!newCamera.onvif_host) {
            showToast('Please enter an ONVIF Host IP first', 'error');
            return;
        }

        setProbingPort(true);
        try {
            const res = await fetch('/api/onvif/deep-scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    ip: newCamera.onvif_host,
                    user: newCamera.onvif_username || '',
                    password: newCamera.onvif_password || ''
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    // Find the best ONVIF port (priority to status onvif_confirmed)
                    const confirmed = data.find(d => d.status === 'onvif_confirmed');
                    const best = confirmed || data[0];
                    
                    if (best && best.port) {
                        setNewCamera(prev => ({ ...prev, onvif_port: best.port }));
                        showToast(`Found ONVIF port: ${best.port}`, 'success');
                    } else {
                        showToast('Scan finished, but no ONVIF ports were found.', 'warning');
                    }
                } else {
                    showToast('No ONVIF services detected at this IP.', 'error');
                }
            } else {
                let errorMsg = 'Port probe failed';
                try {
                    const errData = await res.json();
                    if (errData.detail) {
                        if (Array.isArray(errData.detail)) {
                            // Pydantic validation error array
                            errorMsg = errData.detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join(', ');
                        } else {
                            errorMsg = errData.detail;
                        }
                    }
                } catch (e) {
                    // Fallback to default
                }
                showToast(errorMsg, 'error');
            }
        } catch (err) {
            showToast('Network error during port probe', 'error');
        } finally {
            setProbingPort(false);
        }
    };

    // Inject user:pass@ into an RTSP URL that lacks credentials. ONVIF
    // GetStreamUri usually returns URLs without usable credentials (Dahua omits
    // them entirely; some cameras embed a path-only token), so we reuse the
    // credentials already configured for this camera.
    const injectCreds = (url, user, pass) => {
        if (!url || !user) return url;
        const m = url.match(/^([a-z0-9]+:\/\/)(.*)$/i);
        if (!m || m[2].includes('@')) return url; // unparseable or already has creds
        const cred = pass
            ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
            : encodeURIComponent(user);
        return `${m[1]}${cred}@${m[2]}`;
    };

    // Auto-fill the main + sub RTSP URLs from the detected ONVIF profiles.
    // Convention across cameras: first profile = main (highest res), second = sub.
    const handleUseStreams = () => {
        const profiles = probeResult?.profiles || [];
        if (profiles.length === 0) return;

        // Credentials: prefer the ones already in the main RTSP URL, else ONVIF login.
        const existing = parseRtspUrl(newCamera.rtsp_url);
        const user = existing.user || newCamera.onvif_username || '';
        const pass = existing.pass || newCamera.onvif_password || '';

        const mainUrl = injectCreds(profiles[0].url, user, pass);
        const subUrl = profiles.length > 1 ? injectCreds(profiles[1].url, user, pass) : null;

        setNewCamera(prev => ({
            ...prev,
            rtsp_url: mainUrl,
            ...(subUrl ? { sub_rtsp_url: subUrl } : {})
        }));
        showToast(
            subUrl
                ? t('cameras.streams_filled_both', 'Filled main and sub-stream from ONVIF')
                : t('cameras.streams_filled_main', 'Filled main stream from ONVIF'),
            'success'
        );
    };

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
                    ip: newCamera.onvif_host?.trim() || '',
                    port: parseInt(newCamera.onvif_port) || 80,
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
                        audio_enabled: data.features.audio_enabled,
                        onvif_manufacturer: data.manufacturer,
                        onvif_model: data.model,
                        onvif_firmware: data.firmware,
                        onvif_serial: data.serial,
                        onvif_hw_id: data.hw_id
                    }));
                }
            } else {
                setProbeStatus('error');
                let errorMsg = 'Connection failed';
                try {
                    const errData = await res.json();
                    if (errData.detail) {
                        if (Array.isArray(errData.detail)) {
                            // Pydantic validation error array
                            errorMsg = errData.detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join(', ');
                        } else {
                            errorMsg = errData.detail;
                        }
                    }
                } catch (e) {
                    // Fallback to default
                }
                showToast(errorMsg, 'error');
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
                title={t('cameras.onvif_management', 'ONVIF Management')}
                description={t('cameras.configure_management_co', 'Configure management connection for PTZ and advanced features')}
            />

            <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-3">
                        <InputField
                            label={t('cameras.onvif_host_ip', 'ONVIF Host / IP')}
                            value={newCamera.onvif_host}
                            onChange={(val) => setNewCamera({ ...newCamera, onvif_host: val })}
                            placeholder="192.168.1.100"
                            help={t('cameras.ip_address_used_for_onv', 'IP address used for ONVIF management (often same as camera IP)')}
                        />
                    </div>
                    <div className="relative group">
                        <InputField
                            label={t('cameras.port', 'Port')}
                            type="number"
                            value={newCamera.onvif_port}
                            onChange={(val) => setNewCamera({ ...newCamera, onvif_port: val })}
                            placeholder="80"
                        />
                        <button
                            type="button"
                            onClick={handlePortProbe}
                            disabled={probingPort}
                            className="absolute right-2 top-[34px] p-1.5 hover:bg-primary/10 rounded-md transition-all text-primary hover:text-primary-foreground disabled:opacity-50 z-10"
                            title="Probe ONVIF Port"
                        >
                            {probingPort ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Crosshair className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField
                        label={t('cameras.onvif_username', 'ONVIF Username')}
                        value={newCamera.onvif_username}
                        onChange={(val) => setNewCamera({ ...newCamera, onvif_username: val })}
                        placeholder="admin"
                    />
                    <InputField
                        label={t('cameras.onvif_password', 'ONVIF Password')}
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
                        {t('cameras.test_onvif_connection', 'Test ONVIF Connection')}
                    </Button>

                    {probeStatus === 'success' && (
                        <div className="flex items-center gap-2 text-xs text-green-500 font-medium">
                            <ShieldCheck className="w-4 h-4" />
                            <span>{t('cameras.connection_verified', 'Connection Verified')}</span>
                        </div>
                    )}
                    {probeStatus === 'error' && (
                        <div className="flex items-center gap-2 text-xs text-red-500 font-medium">
                            <ShieldAlert className="w-4 h-4" />
                            <span>{t('cameras.connection_failed', 'Connection Failed')}</span>
                        </div>
                    )}
                </div>
            </div>

            {((probeStatus === 'success' && probeResult) || (newCamera.onvif_manufacturer || newCamera.onvif_model)) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 bg-muted/20 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground m-0">{t('cameras.device_information', 'Device Information')}</h5>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-muted-foreground opacity-70 mb-1">{t('cameras.manufacturer', 'Manufacturer')}</span>
                                <span className="text-sm font-medium break-words" title={probeResult?.manufacturer || newCamera.onvif_manufacturer || '-'}>{probeResult?.manufacturer || newCamera.onvif_manufacturer || '-'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-muted-foreground opacity-70 mb-1">{t('cameras.model', 'Model')}</span>
                                <span className="text-sm font-medium break-words" title={probeResult?.model || newCamera.onvif_model || '-'}>{probeResult?.model || newCamera.onvif_model || '-'}</span>
                            </div>
                            <div className="flex flex-col sm:col-span-1">
                                <span className="text-[9px] uppercase font-bold text-muted-foreground opacity-70 mb-1">{t('cameras.firmware', 'Firmware')}</span>
                                <span className="text-sm font-medium break-words" title={probeResult?.firmware || newCamera.onvif_firmware || '-'}>{probeResult?.firmware || newCamera.onvif_firmware || '-'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-muted-foreground opacity-70 mb-1">{t('cameras.serial_number', 'Serial Number')}</span>
                                <span className="text-sm font-medium break-words" title={probeResult?.serial || newCamera.onvif_serial || '-'}>{probeResult?.serial || newCamera.onvif_serial || '-'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-muted-foreground opacity-70 mb-1">{t('cameras.hardware_id', 'Hardware ID')}</span>
                                <span className="text-sm font-medium break-words" title={probeResult?.hw_id || newCamera.onvif_hw_id || '-'}>{probeResult?.hw_id || newCamera.onvif_hw_id || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-muted/20 rounded-lg border border-border">
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('cameras.detected_capabilities', 'Detected Capabilities')}</h5>
                        <div className="flex flex-wrap gap-2">
                            {(probeResult?.features?.ptz_can_pan_tilt ?? newCamera.ptz_can_pan_tilt) && (
                                <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 text-[10px] font-bold rounded-md border border-indigo-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Pan/Tilt
                                </span>
                            )}
                            {(probeResult?.features?.ptz_can_zoom ?? newCamera.ptz_can_zoom) && (
                                <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-bold rounded-md border border-blue-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Zoom
                                </span>
                            )}
                            {(probeResult?.features?.ptz_can_home ?? newCamera.ptz_can_home) && (
                                <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-md border border-green-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Home Position
                                </span>
                            )}
                            {(probeResult?.features?.onvif_can_events ?? newCamera.onvif_can_events) && (
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-md border border-amber-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Edge Events
                                </span>
                            )}
                            {(probeResult?.features?.audio_enabled ?? newCamera.audio_enabled) && (
                                <span className="px-2 py-1 bg-pink-500/10 text-pink-500 text-[10px] font-bold rounded-md border border-pink-500/20 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Audio
                                </span>
                            )}
                            {![
                                probeResult?.features?.ptz_can_pan_tilt ?? newCamera.ptz_can_pan_tilt,
                                probeResult?.features?.ptz_can_zoom ?? newCamera.ptz_can_zoom,
                                probeResult?.features?.ptz_can_home ?? newCamera.ptz_can_home,
                                probeResult?.features?.onvif_can_events ?? newCamera.onvif_can_events,
                                probeResult?.features?.audio_enabled ?? newCamera.audio_enabled
                            ].some(v => v) && (
                                <span className="text-[10px] text-muted-foreground italic">{t('cameras.no_advanced_features_dete', 'No advanced features detected')}</span>
                            )}
                        </div>
                    </div>

                    {probeResult?.profiles?.length > 0 && (
                        <div className="p-4 bg-muted/20 rounded-lg border border-border">
                            <div className="flex items-center justify-between mb-3 gap-2">
                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground m-0">{t('cameras.detected_stream_profiles', 'Detected Stream Profiles')}</h5>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleUseStreams}
                                    className="h-7 px-2.5 text-[11px] shrink-0"
                                    title={t('cameras.use_streams_help', 'Fill the main and sub-stream URLs from these profiles (credentials are reused from the current URL)')}
                                >
                                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                                    {t('cameras.use_these_streams', 'Use these streams')}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {probeResult.profiles.map((profile, idx) => (
                                    <div key={idx} className="flex flex-col gap-1 p-2 bg-background/50 rounded border border-border/50">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold">{profile.name}{idx === 0 ? ` · ${t('cameras.main_label', 'main')}` : idx === 1 ? ` · ${t('cameras.sub_label', 'sub')}` : ''}</span>
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
                    {t('cameras.why_configure_onvif', 'Why configure ONVIF?')}
                </h5>
                <ul className="text-xs space-y-2 text-muted-foreground list-disc pl-4">
                    <li>{t('cameras.enable_real_time_pan_tilt', 'Enable real-time Pan, Tilt, and Zoom controls directly from the dashboard.')}</li>
                    <li>{t('cameras.enable', 'Enable')} <strong>{t('cameras.onvif_edge_motion_detecti', 'ONVIF Edge Motion Detection')}</strong> to offload processing to camera hardware, drastically reducing NVR server CPU usage.</li>
                    <li>{t('cameras.higher_detection_accuracy', "Higher detection accuracy by utilizing the camera's native sensor-level analytics.")}</li>
                </ul>
            </div>
        </div>
    );
};
