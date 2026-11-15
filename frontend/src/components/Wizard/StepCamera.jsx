import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2, Pencil, X, Save, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CameraScanner } from '../CameraScanner';

const BRAND_TEMPLATES = [
    { id: 'generic', name: 'Generic RTSP', url: 'rtsp://user:password@192.168.1.100:554/stream1' },
    { id: 'tapo', name: 'TP-Link Tapo', url: 'rtsp://user:password@192.168.1.100:554/stream1' },
    { id: 'reolink', name: 'Reolink', url: 'rtsp://admin:password@192.168.1.100:554/h264Preview_01_main' },
    { id: 'hikvision', name: 'Hikvision', url: 'rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101' },
    { id: 'dahua', name: 'Dahua', url: 'rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0' },
];

export const StepCamera = ({ cameras = [], onCameraSaved }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();

    const [editingId, setEditingId] = useState(null);
    const [brand, setBrand] = useState('generic');
    const [name, setName] = useState('');
    const [rtspUrl, setRtspUrl] = useState(BRAND_TEMPLATES[0].url);
    const [recordingMode, setRecordingMode] = useState('Motion');
    const [detectEngine, setDetectEngine] = useState('opencv');
    const [motionThreshold, setMotionThreshold] = useState(1500);
    const [scheduleMode, setScheduleMode] = useState('always');
    const [scheduleStart, setScheduleStart] = useState('08:00');
    const [scheduleEnd, setScheduleEnd] = useState('20:00');
    const [saveSnapshots, setSaveSnapshots] = useState(false);
    const [snapshotInterval, setSnapshotInterval] = useState(60);
    const [textOverlay, setTextOverlay] = useState(false);
    const [textLeft, setTextLeft] = useState('camera_name');
    const [textRight, setTextRight] = useState('timestamp');
    const [textScale, setTextScale] = useState(1);
    const [onvifHost, setOnvifHost] = useState('');
    const [onvifPort, setOnvifPort] = useState(80);
    const [onvifUsername, setOnvifUsername] = useState('');
    const [onvifPassword, setOnvifPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    const handleBrandChange = (id) => {
        setBrand(id);
        const tpl = BRAND_TEMPLATES.find(b => b.id === id);
        if (tpl && !editingId) setRtspUrl(tpl.url);
    };

    const startEdit = (cam) => {
        setEditingId(cam.id);
        setName(cam.name || '');
        setRtspUrl(cam.rtsp_url || '');
        setRecordingMode(cam.recording_mode || 'Motion');
        setDetectEngine(cam.detect_engine || 'opencv');
        setMotionThreshold(cam.motion_threshold || 1500);
        setScheduleMode(cam.schedule_mode || (cam.schedule_enabled ? 'schedule' : 'always'));
        setScheduleStart(cam.schedule_start || '08:00');
        setScheduleEnd(cam.schedule_end || '20:00');
        setSaveSnapshots(Boolean(cam.save_snapshots));
        setSnapshotInterval(cam.snapshot_interval || 60);
        setTextOverlay(Boolean(cam.text_overlay));
        setTextLeft(cam.text_left || 'camera_name');
        setTextRight(cam.text_right || 'timestamp');
        setTextScale(cam.text_scale || 1);
        setOnvifHost(cam.onvif_host || '');
        setOnvifPort(cam.onvif_port || 80);
        setOnvifUsername(cam.onvif_username || '');
        setOnvifPassword(cam.onvif_password || '');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setName('');
        setRtspUrl(BRAND_TEMPLATES.find(b => b.id === brand)?.url || '');
        setRecordingMode('Motion');
        setDetectEngine('opencv');
        setMotionThreshold(1500);
        setScheduleMode('always');
        setScheduleStart('08:00');
        setScheduleEnd('20:00');
        setSaveSnapshots(false);
        setSnapshotInterval(60);
        setTextOverlay(false);
        setTextLeft('camera_name');
        setTextRight('timestamp');
        setTextScale(1);
        setOnvifHost('');
        setOnvifPort(80);
        setOnvifUsername('');
        setOnvifPassword('');
    };

    const handleSaveCamera = async () => {
        if (!name.trim() || !rtspUrl.trim()) {
            showToast(t('wizard.camera.fill_required', 'Please enter a camera name and RTSP URL'), 'error');
            return;
        }
        setSaving(true);
        const isEdit = Boolean(editingId);
        try {
            const res = await fetch(isEdit ? `/api/cameras/${editingId}` : '/api/cameras', {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: name.trim(),
                    rtsp_url: rtspUrl.trim(),
                    recording_mode: recordingMode,
                    detect_engine: detectEngine,
                    motion_threshold: Number(motionThreshold) || 1500,
                    schedule_mode: scheduleMode,
                    schedule_enabled: scheduleMode === 'schedule',
                    schedule_start: scheduleStart,
                    schedule_end: scheduleEnd,
                    save_snapshots: saveSnapshots,
                    snapshot_interval: Number(snapshotInterval) || 60,
                    text_overlay: textOverlay,
                    text_left: textLeft,
                    text_right: textRight,
                    text_scale: Number(textScale) || 1,
                    ...(onvifHost.trim() ? {
                        onvif_host: onvifHost.trim(),
                        onvif_port: Number(onvifPort) || 80,
                        onvif_username: onvifUsername.trim(),
                        ...(onvifPassword ? { onvif_password: onvifPassword } : {})
                    } : {}),
                    is_active: true
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to save camera');
            }
            const saved = await res.json();
            onCameraSaved(saved, isEdit);
            cancelEdit();
            showToast(
                isEdit
                    ? t('wizard.camera.updated_success', 'Camera updated successfully')
                    : t('wizard.camera.added_success', 'Camera added successfully'),
                'success'
            );
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold mb-1">{t('wizard.camera.title', 'Cameras')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('wizard.camera.subtitle', 'View/edit existing cameras or add new ones using brand templates.')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowScanner(s => !s)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                            showScanner ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
                        }`}
                    >
                        <Search className="w-3.5 h-3.5" />
                        {showScanner ? t('wizard.camera.hide_scanner', 'Hide Scanner') : t('wizard.camera.scan_network', 'Scan Network')}
                    </button>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                        {cameras.length} {t('wizard.camera.total', 'total')}
                    </span>
                </div>
            </div>

            {showScanner && (
                <div className="border border-border rounded-xl p-3 bg-muted/10">
                    <CameraScanner
                        existingCameras={cameras}
                        onAddCamera={(camData) => {
                            setEditingId(null);
                            setName(camData.name || '');
                            setRtspUrl(camData.rtsp_url || '');
                            setShowScanner(false);
                        }}
                    />
                </div>
            )}

            {cameras.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {cameras.map(cam => (
                        <div
                            key={cam.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-sm ${
                                editingId === cam.id ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
                            }`}
                        >
                            <div className="min-w-0">
                                <p className="font-medium truncate">{cam.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{cam.recording_mode || 'Motion'}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => editingId === cam.id ? cancelEdit() : startEdit(cam)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent"
                            >
                                {editingId === cam.id ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                {editingId === cam.id ? t('common.cancel', 'Cancel') : t('common.edit', 'Edit')}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!editingId && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {BRAND_TEMPLATES.map(b => (
                        <button
                            key={b.id}
                            type="button"
                            onClick={() => handleBrandChange(b.id)}
                            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                                brand === b.id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-accent text-muted-foreground'
                            }`}
                        >
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('wizard.camera.name', 'Camera Name')}</label>
                    <input
                        type="text"
                        placeholder={t('wizard.camera.name_placeholder', 'e.g. Front Door')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('wizard.camera.mode', 'Recording Mode')}</label>
                    <select
                        value={recordingMode}
                        onChange={(e) => setRecordingMode(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="Motion">{t('wizard.camera.mode_motion', 'Motion Only')}</option>
                        <option value="Continuous">{t('wizard.camera.mode_continuous', 'Continuous')}</option>
                        <option value="Snapshot">{t('wizard.camera.mode_snapshot', 'Snapshot')}</option>
                    </select>
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('wizard.camera.rtsp_url', 'RTSP Stream URL')}</label>
                <input
                    type="text"
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>

            <div className="space-y-3 pt-1">
                <label className="text-xs font-medium text-muted-foreground block">
                    {t('wizard.camera.features_title', 'Camera Features & Detection')}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.detect_engine', 'Detection Engine')}</label>
                        <select
                            value={detectEngine}
                            onChange={(e) => setDetectEngine(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="opencv">{t('wizard.camera.engine_opencv', 'OpenCV (Server image analysis)')}</option>
                            <option value="ai">{t('wizard.camera.engine_ai', 'AI (Object detection - TPU/CPU)')}</option>
                            <option value="onvif">{t('wizard.camera.engine_onvif', 'ONVIF Edge (Camera hardware)')}</option>
                            <option value="hikvision_isapi">{t('wizard.camera.engine_hikvision', 'Hikvision ISAPI')}</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.schedule_mode', 'Detection Schedule Mode')}</label>
                        <select
                            value={scheduleMode}
                            onChange={(e) => setScheduleMode(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="always">{t('wizard.camera.sched_always', 'Always')}</option>
                            <option value="schedule">{t('wizard.camera.sched_hours', 'Working Hours')}</option>
                            <option value="manual">{t('wizard.camera.sched_manual', 'Manual Switch')}</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20 cursor-pointer hover:bg-muted/30">
                        <input type="checkbox" checked={saveSnapshots} onChange={(e) => setSaveSnapshots(e.target.checked)} className="accent-primary mt-0.5" />
                        <div>
                            <p className="text-xs font-medium">{t('wizard.camera.snapshots', 'Auto-save Motion Snapshots')}</p>
                            <p className="text-[11px] text-muted-foreground">{t('wizard.camera.snapshots_desc', 'Save JPEG snapshots alongside motion events')}</p>
                        </div>
                    </label>
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20 cursor-pointer hover:bg-muted/30">
                        <input type="checkbox" checked={textOverlay} onChange={(e) => setTextOverlay(e.target.checked)} className="accent-primary mt-0.5" />
                        <div>
                            <p className="text-xs font-medium">{t('wizard.camera.overlay', 'OSD Text Overlay')}</p>
                            <p className="text-[11px] text-muted-foreground">{t('wizard.camera.overlay_desc', 'Burn camera name & timestamp onto video')}</p>
                        </div>
                    </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {detectEngine === 'opencv' && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.motion_sensitivity', 'Motion Sensitivity')}</label>
                            <select
                                value={motionThreshold}
                                onChange={(e) => setMotionThreshold(Number(e.target.value))}
                                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value={800}>{t('wizard.camera.sens_high', 'High (800)')}</option>
                                <option value={1500}>{t('wizard.camera.sens_medium', 'Medium (1500)')}</option>
                                <option value={3000}>{t('wizard.camera.sens_low', 'Low (3000)')}</option>
                            </select>
                        </div>
                    )}
                    {scheduleMode === 'schedule' && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.schedule_hours', 'Active Hours')}</label>
                            <div className="flex items-center gap-1.5">
                                <input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-1 text-xs" />
                                <span className="text-xs text-muted-foreground">-</span>
                                <input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} className="w-full bg-background border border-border rounded-lg px-2 py-1 text-xs" />
                            </div>
                        </div>
                    )}
                    {saveSnapshots && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.snapshot_interval', 'Snapshot Interval (s)')}</label>
                            <input
                                type="number"
                                min="5"
                                max="86400"
                                value={snapshotInterval}
                                onChange={(e) => setSnapshotInterval(Number(e.target.value) || 60)}
                                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    )}
                </div>
            </div>

            {textOverlay && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-border bg-muted/10">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.text_left', 'Left Text')}</label>
                        <select value={textLeft} onChange={(e) => setTextLeft(e.target.value)} className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs">
                            <option value="camera_name">{t('wizard.camera.opt_name', 'Camera Name')}</option>
                            <option value="timestamp">{t('wizard.camera.opt_timestamp', 'Timestamp')}</option>
                            <option value="none">{t('common.none', 'None')}</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.text_right', 'Right Text')}</label>
                        <select value={textRight} onChange={(e) => setTextRight(e.target.value)} className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs">
                            <option value="timestamp">{t('wizard.camera.opt_timestamp', 'Timestamp')}</option>
                            <option value="camera_name">{t('wizard.camera.opt_name', 'Camera Name')}</option>
                            <option value="none">{t('common.none', 'None')}</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('wizard.camera.text_scale', 'Text Scale')} ({textScale}x)</label>
                        <input type="range" min="1" max="5" step="0.5" value={textScale} onChange={(e) => setTextScale(Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">{t('wizard.camera.onvif_section', 'ONVIF Management (Optional)')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                        type="text"
                        placeholder="Host/IP (192.168.1.160)"
                        value={onvifHost}
                        onChange={(e) => setOnvifHost(e.target.value)}
                        className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    />
                    <input
                        type="number"
                        placeholder="Port (80)"
                        value={onvifPort}
                        onChange={(e) => setOnvifPort(Number(e.target.value) || 80)}
                        className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    />
                    <input
                        type="text"
                        placeholder={t('wizard.camera.onvif_user', 'Username')}
                        value={onvifUsername}
                        onChange={(e) => setOnvifUsername(e.target.value)}
                        className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <input
                        type="password"
                        placeholder={t('wizard.camera.onvif_pass', 'Password')}
                        value={onvifPassword}
                        onChange={(e) => setOnvifPassword(e.target.value)}
                        className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                {editingId && (
                    <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                )}
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveCamera}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingId ? t('wizard.camera.save_btn', 'Save Changes') : t('wizard.camera.add_btn', 'Add Camera')}
                </button>
            </div>
        </div>
    );
};
