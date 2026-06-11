import React from 'react';
import { InputField, SelectField, SectionHeader } from '../../../ui/FormControls';
import { parseRtspUrl } from '../../../../utils/cameraUtils';
import { Shield, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const GeneralTab = ({ newCamera, setNewCamera, storageProfiles }) => {
  const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.camera_identity', 'Camera Identity')} description={t('cameras.basic_camera_informatio', 'Basic camera information')} />
            <InputField
                label={t('cameras.camera_name_label', 'Camera Name')}
                value={newCamera.name}
                onChange={(val) => setNewCamera({ ...newCamera, name: val })}
                placeholder={t('cameras.enter_camera_name', 'Enter camera name')}
            />
            <InputField
                label={t('cameras.location', 'Location')}
                value={newCamera.location}
                onChange={(val) => setNewCamera({ ...newCamera, location: val })}
                placeholder={t('cameras.e_g_front_door_backyard', 'e.g. Front Door, Backyard')}
            />
            <SectionHeader title={t('cameras.connection', 'Connection')} description={t('cameras.video_source_configurat', 'Video source configuration')} />
            <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <InputField
                        label={t('cameras.username_optional', 'Username (Optional)')}
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
                        label={t('cameras.password_optional', 'Password (Optional)')}
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
                    label={t('cameras.rtsp_url', 'RTSP URL')}
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
                        <span>{t('cameras.secure_connection_rstsps', 'Secure Connection (RSTSPS/RTSPS) detected. Hardware acceleration and certificate skip are enabled automatically.')}</span>
                    </div>
                ) : null}

                <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50">
                    <span className="font-semibold">{t('cameras.full_redacted_url', 'Full Redacted URL:')}</span> {
                        newCamera.rtsp_url?.replace(/:([^:@]+)@/, ':********@') || ''
                    }
                </div>

                <SelectField
                    label={t('cameras.rtsp_transport', 'RTSP Transport')}
                    value={newCamera.rtsp_transport || 'tcp'}
                    onChange={(val) => setNewCamera({ ...newCamera, rtsp_transport: val })}
                    options={[
                        { value: 'tcp', label: t('cameras.tcp_more_stable', 'TCP (More Stable)') },
                        { value: 'udp', label: t('cameras.udp_lower_latency', 'UDP (Lower Latency)') }
                    ]}
                    help={t('cameras.tcp_is_recommended_for_', 'TCP is recommended for most cameras. Use UDP only if you experience lag or if your camera prefers it.')}
                />

                <div className="h-px bg-border my-6" />
                
                <h3 className="text-sm font-medium text-foreground">{t('cameras.sub_stream_configuration', 'Sub-Stream Configuration (Optional)')}</h3>
                <p className="text-xs text-muted-foreground mb-4">{t('cameras.optimize_live_dashboard_b', 'Optimize live dashboard bandwidth')}</p>

                <InputField
                    label={t('cameras.sub_stream_url', 'Sub-Stream URL')}
                    value={(() => {
                        if (!newCamera.sub_rtsp_url) return '';
                        const { protocol, host } = parseRtspUrl(newCamera.sub_rtsp_url);
                        return `${protocol}://${host}`;
                    })()}
                    icon={newCamera.sub_rtsp_url?.startsWith('rstsps') || newCamera.sub_rtsp_url?.startsWith('rtsps') ? Shield : null}
                    onChange={(val) => {
                        if (val.includes('://') && val.includes('@')) {
                            const { user, pass } = parseRtspUrl(val);
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
                                <span>{t('cameras.sub_stream_secure_connect', 'Sub-Stream Secure Connection detected.')}</span>
                            </div>
                        ) : null}
                        <div className="text-[10px] text-muted-foreground break-all p-2 bg-background/50 rounded border border-border/50 mb-2">
                            <span className="font-semibold">{t('cameras.sub_stream_redacted_url', 'Sub-Stream Redacted URL:')}</span> {
                                newCamera.sub_rtsp_url?.replace(/:([^:@]+)@/, ':********@') || ''
                            }
                        </div>
                        <SelectField
                            className="mt-2"
                            label={t('cameras.sub_stream_rtsp_transpo', 'Sub-Stream RTSP Transport')}
                            value={newCamera.sub_rtsp_transport || 'tcp'}
                            onChange={(val) => setNewCamera({ ...newCamera, sub_rtsp_transport: val })}
                            options={[
                                { value: 'tcp', label: t('cameras.tcp_more_stable', 'TCP (More Stable)') },
                                { value: 'udp', label: t('cameras.udp_lower_latency', 'UDP (Lower Latency)') }
                            ]}
                        />
                    </>
                )}

                <SectionHeader title={t('cameras.storage', 'Storage')} description={t('cameras.where_to_save_recording', 'Where to save recordings and snapshots')} />
                <SelectField
                    label={t('cameras.storage_profile', 'Storage Profile')}
                    value={newCamera.storage_profile_id || ''}
                    onChange={(val) => setNewCamera({ ...newCamera, storage_profile_id: val === '' ? null : parseInt(val) })}
                    options={[
                        { value: '', label: t('cameras.default_var_lib_vibe_re', 'Default (/var/lib/vibe/recordings)') },
                        ...storageProfiles.map(p => ({ value: p.id.toString(), label: `${p.name} (${p.path})` }))
                    ]}
                    help={t('cameras.select_a_custom_storage', "Select a custom storage location for this camera's media.")}
                />

                <SelectField
                    label={t('cameras.live_view_mode', 'Live View Mode')}
                    help={t('cameras.choose_the_streaming_te', 'Choose the streaming technology for real-time monitoring. Auto uses WebCodecs with MJPEG fallback.')}
                    options={[
                        { value: 'auto', label: t('cameras.auto_recommended', 'Auto (Recommended)') },
                        { value: 'webcodecs', label: t('cameras.force_webcodecs', 'Force WebCodecs') },
                        { value: 'mjpeg', label: t('cameras.force_mjpeg_polling', 'Force MJPEG Polling') }
                    ]}
                    value={newCamera.live_view_mode || 'auto'}
                    onChange={(val) => setNewCamera({ ...newCamera, live_view_mode: val })}
                />
                {newCamera.live_view_mode === 'webcodecs' && !window.isSecureContext && (
                    <div className="flex items-center gap-2 text-[10px] bg-amber-500/10 text-amber-500 p-2 rounded border border-amber-500/20 mt-[-10px] mb-2 animate-in fade-in slide-in-from-top-1 duration-300">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('cameras.webcodecs_is_typically_bl', 'WebCodecs is typically blocked by browsers on HTTP. Access via HTTPS or localhost to enable it.')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
