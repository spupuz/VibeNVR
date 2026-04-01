import React from 'react';
import { InputField, SelectField, SectionHeader } from '../../../ui/FormControls';
import { parseRtspUrl } from '../../../utils/cameraUtils';
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
                            const { protocol } = parseRtspUrl(newCamera.rtsp_url);
                            const pass = newCamera.rtsp_password || '';
                            const host = newCamera.rtsp_host || '';
                            const url = `${protocol}://${val}${pass ? ':' + pass : ''}${val || pass ? '@' : ''}${host}`;
                            setNewCamera({ ...newCamera, rtsp_username: val, rtsp_url: url });
                        }}
                        placeholder="admin"
                    />
                    <InputField
                        label="Password (Optional)"
                        type={newCamera.show_password ? "text" : "password"}
                        value={newCamera.rtsp_password || ''}
                        onChange={(val) => {
                            const { protocol } = parseRtspUrl(newCamera.rtsp_url);
                            const user = newCamera.rtsp_username || '';
                            const host = newCamera.rtsp_host || '';
                            const url = `${protocol}://${user}${val ? ':' + val : ''}${user || val ? '@' : ''}${host}`;
                            setNewCamera({ ...newCamera, rtsp_password: val, rtsp_url: url });
                        }}
                        placeholder="••••••"
                        showPasswordToggle
                        showPassword={newCamera.show_password}
                        onTogglePassword={() => setNewCamera({ ...newCamera, show_password: !newCamera.show_password })}
                    />
                </div>

                <InputField
                    label="RTSP Host & Path"
                    value={newCamera.rtsp_host || ''}
                    onChange={(val) => {
                        if (val.includes('://')) {
                            const { user, pass, host, protocol } = parseRtspUrl(val);
                            const url = `${protocol}://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${host}`;
                            setNewCamera({ 
                                ...newCamera, 
                                rtsp_username: user, 
                                rtsp_password: pass, 
                                rtsp_host: host, 
                                rtsp_url: url 
                            });
                        } else {
                            const { protocol } = parseRtspUrl(newCamera.rtsp_url);
                            const user = newCamera.rtsp_username || '';
                            const pass = newCamera.rtsp_password || '';
                            const url = `${protocol}://${user}${pass ? ':' + pass : ''}${user || pass ? '@' : ''}${val}`;
                            setNewCamera({ ...newCamera, rtsp_host: val, rtsp_url: url });
                        }
                    }}
                    placeholder="192.168.1.100:554/stream1"
                />

                {newCamera.rtsp_url?.startsWith('rstsps') || newCamera.rtsp_url?.startsWith('rtsps') ? (
                    <div className="flex items-center gap-2 text-[10px] bg-blue-500/10 text-blue-500 p-2 rounded border border-blue-500/20">
                        <Shield className="w-3 h-3" />
                        <span>Secure Connection (RSTSPS/RTSPS) detected. Hardware acceleration and certificate skip are enabled automatically.</span>
                    </div>
                ) : null}

                <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50">
                    <span className="font-semibold">Full URL:</span> {
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
