import React from 'react';
import { InputField, SelectField, SectionHeader } from '../../../ui/FormControls';
import { parseRtspUrl } from '../../../../utils/cameraUtils';
import { Shield, ShieldAlert } from 'lucide-react';

export const GeneralTab = ({ newCamera, setNewCamera, storageProfiles }) => {
    return (
        <div className="space-y-6">
            <SectionHeader title="Camera Identity" description="Basic camera information" />
            <InputField
                label="Camera Name"
                value={newCamera.name}
                onChange={(val) => setNewCamera({ ...newCamera, name: val })}
                placeholder="Enter camera name"
            />
            <InputField
                label="Location"
                value={newCamera.location}
                onChange={(val) => setNewCamera({ ...newCamera, location: val })}
                placeholder="e.g. Front Door, Backyard"
            />
            <SectionHeader title="Connection" description="Video source configuration" />
            <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <InputField
                        label="Username (Optional)"
                        value={newCamera.rtsp_username || ''}
                        onChange={(val) => {
                            const { protocol, pass, host } = parseRtspUrl(newCamera.rtsp_url || 'rtsp://');
                            const u = val ? encodeURIComponent(val) : '';
                            const pw = pass ? encodeURIComponent(pass) : '';
                            const url = `${protocol || 'rtsp'}://${u}${pw ? ':' + pw : ''}${u || pw ? '@' : ''}${host}`;
                            setNewCamera({ ...newCamera, rtsp_username: val, rtsp_url: url });
                        }}
                        placeholder="admin"
                    />
                    <InputField
                        label="Password (Optional)"
                        type={newCamera.show_password ? "text" : "password"}
                        value={newCamera.rtsp_password || ''}
                        onChange={(val) => {
                            const { protocol, user, host } = parseRtspUrl(newCamera.rtsp_url || 'rtsp://');
                            const u = user ? encodeURIComponent(user) : '';
                            const pw = val ? encodeURIComponent(val) : '';
                            const url = `${protocol || 'rtsp'}://${u}${pw ? ':' + pw : ''}${u || pw ? '@' : ''}${host}`;
                            setNewCamera({ ...newCamera, rtsp_password: val, rtsp_url: url });
                        }}
                        placeholder="••••••"
                        showPasswordToggle
                        showPassword={newCamera.show_password}
                        onTogglePassword={() => setNewCamera({ ...newCamera, show_password: !newCamera.show_password })}
                    />
                </div>

                <InputField
                    label="RTSP URL"
                    value={(() => {
                        const { protocol, host } = parseRtspUrl(newCamera.rtsp_url || 'rtsp://');
                        return `${protocol}://${host}`;
                    })()}
                    icon={newCamera.rtsp_url?.startsWith('rstsps') || newCamera.rtsp_url?.startsWith('rtsps') ? Shield : null}
                    onChange={(val) => {
                        if (val.includes('://') && val.includes('@')) {
                            const { user, pass, host, protocol } = parseRtspUrl(val);
                             const finalUrl = `${protocol}://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${host}`;
                            setNewCamera({ 
                                ...newCamera, 
                                rtsp_username: user, 
                                rtsp_password: pass, 
                                rtsp_host: host, 
                                rtsp_url: finalUrl 
                            });
                        } else {
                            const { protocol: newProto, host: newHost } = parseRtspUrl(val.includes('://') ? val : `rtsp://${val}`);
                            const currentPass = newCamera.rtsp_password || '';
                            const currentUser = newCamera.rtsp_username || '';
                            const u = currentUser ? encodeURIComponent(currentUser) : '';
                            const pw = currentPass ? encodeURIComponent(currentPass) : '';
                            const finalUrl = `${newProto}://${u}${pw ? ':' + pw : ''}${u || pw ? '@' : ''}${newHost}`;
                            setNewCamera({ ...newCamera, rtsp_host: newHost, rtsp_url: finalUrl });
                        }
                    }}
                    placeholder="rtsp://192.168.1.100:554/stream1"
                />

                {newCamera.rtsp_url?.startsWith('rstsps') || newCamera.rtsp_url?.startsWith('rtsps') ? (
                    <div className="flex items-center gap-2 text-[10px] bg-blue-500/10 text-blue-500 p-2 rounded border border-blue-500/20">
                        <Shield className="w-3 h-3" />
                        <span>Secure Connection (RSTSPS/RTSPS) detected. Hardware acceleration and certificate skip are enabled automatically.</span>
                    </div>
                ) : null}

                <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50">
                    <span className="font-semibold">Full Redacted URL:</span> {
                        newCamera.rtsp_url?.replace(/:([^:@]+)@/, ':********@') || ''
                    }
                </div>

                <SelectField
                    label="RTSP Transport"
                    value={newCamera.rtsp_transport || 'tcp'}
                    onChange={(val) => setNewCamera({ ...newCamera, rtsp_transport: val })}
                    options={[
                        { value: 'tcp', label: 'TCP (More Stable)' },
                        { value: 'udp', label: 'UDP (Lower Latency)' }
                    ]}
                    help="TCP is recommended for most cameras. Use UDP only if you experience lag or if your camera prefers it."
                />

                <div className="h-px bg-border my-6" />
                
                <h3 className="text-sm font-medium text-foreground">Sub-Stream Configuration (Optional)</h3>
                <p className="text-xs text-muted-foreground mb-4">Optimize live dashboard bandwidth</p>

                <InputField
                    label="Sub-Stream URL"
                    value={(() => {
                        if (!newCamera.sub_rtsp_url) return '';
                        const { protocol, host } = parseRtspUrl(newCamera.sub_rtsp_url);
                        return `${protocol}://${host}`;
                    })()}
                    icon={newCamera.sub_rtsp_url?.startsWith('rstsps') || newCamera.sub_rtsp_url?.startsWith('rtsps') ? Shield : null}
                    onChange={(val) => {
                        if (val.includes('://') && val.includes('@')) {
                            const { user, pass, host, protocol } = parseRtspUrl(val);
                            setNewCamera({ 
                                ...newCamera, 
                                rtsp_username: user, 
                                rtsp_password: pass, 
                                sub_rtsp_url: val 
                            });
                        } else {
                            const { protocol: mainProto, user, pass } = parseRtspUrl(newCamera.rtsp_url || 'rtsp://');
                            const { protocol: subProto, host: subHost } = parseRtspUrl(val.includes('://') ? val : `${mainProto}://${val}`);
                            const u = user ? encodeURIComponent(user) : '';
                            const pw = pass ? encodeURIComponent(pass) : '';
                            const finalUrl = `${subProto}://${u}${pw ? ':' + pw : ''}${u || pw ? '@' : ''}${subHost}`;
                            setNewCamera({ ...newCamera, sub_rtsp_url: finalUrl });
                        }
                    }}
                    placeholder="rtsp://192.168.1.100:554/stream2"
                />

                {newCamera.sub_rtsp_url && (
                    <>
                        {newCamera.sub_rtsp_url?.startsWith('rstsps') || newCamera.sub_rtsp_url?.startsWith('rtsps') ? (
                            <div className="flex items-center gap-2 text-[10px] bg-blue-500/10 text-blue-500 p-2 rounded border border-blue-500/20 mb-2 mt-[-5px]">
                                <Shield className="w-3 h-3" />
                                <span>Sub-Stream Secure Connection detected.</span>
                            </div>
                        ) : null}
                        <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50 mb-2">
                            <span className="font-semibold">Sub-Stream Redacted URL:</span> {
                                newCamera.sub_rtsp_url?.replace(/:([^:@]+)@/, ':********@') || ''
                            }
                        </div>
                        <SelectField
                            className="mt-2"
                            label="Sub-Stream RTSP Transport"
                            value={newCamera.sub_rtsp_transport || 'tcp'}
                            onChange={(val) => setNewCamera({ ...newCamera, sub_rtsp_transport: val })}
                            options={[
                                { value: 'tcp', label: 'TCP (More Stable)' },
                                { value: 'udp', label: 'UDP (Lower Latency)' }
                            ]}
                        />
                    </>
                )}

                <SectionHeader title="Storage" description="Where to save recordings and snapshots" />
                <SelectField
                    label="Storage Profile"
                    value={newCamera.storage_profile_id || ''}
                    onChange={(val) => setNewCamera({ ...newCamera, storage_profile_id: val === '' ? null : parseInt(val) })}
                    options={[
                        { value: '', label: 'Default (/var/lib/vibe/recordings)' },
                        ...storageProfiles.map(p => ({ value: p.id.toString(), label: `${p.name} (${p.path})` }))
                    ]}
                    help="Select a custom storage location for this camera's media."
                />

                <SelectField
                    label="Live View Mode"
                    help="Choose the streaming technology for real-time monitoring. Auto uses WebCodecs with MJPEG fallback."
                    options={[
                        { value: 'auto', label: 'Auto (Recommended)' },
                        { value: 'webcodecs', label: 'Force WebCodecs' },
                        { value: 'mjpeg', label: 'Force MJPEG Polling' }
                    ]}
                    value={newCamera.live_view_mode || 'auto'}
                    onChange={(val) => setNewCamera({ ...newCamera, live_view_mode: val })}
                />
            </div>
        </div>
    );
};
