import React, { useState, useEffect, useCallback } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';

// Modularized Sections
import { UserManager } from './Settings/sections/UserManager';
import { StorageManager } from './Settings/sections/StorageManager';
import { ApiTokenSettings } from './Settings/sections/ApiTokenSettings';
import { PrivacySettings } from './Settings/sections/PrivacySettings';
import { LiveViewLayoutSettings } from './Settings/sections/LiveViewLayoutSettings';
import { GeneralSettings } from './Settings/sections/GeneralSettings';
import { NotificationSettings } from './Settings/sections/NotificationSettings';
import { MqttSettings } from './Settings/sections/MqttSettings';
import { AdvancedSettings } from './Settings/sections/AdvancedSettings';
import { BackupSettings } from './Settings/sections/BackupSettings';
import { AISettings } from './Settings/sections/AISettings';

// Modularized Modals
import { PasswordChangeModal } from './Settings/PasswordChangeModal';
import { SyncResultModal } from './Settings/SyncResultModal';

export const Settings = () => {
    const { user, token } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [openSection, setOpenSection] = useState('users');

    const [liveViewColumns, setLiveViewColumns] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    // Global settings from backend
    const [globalSettings, setGlobalSettings] = useState({
        max_global_storage_gb: '',
        cleanup_enabled: true,
        cleanup_interval_hours: 24,
        smtp_server: '',
        smtp_port: '587',
        smtp_username: '',
        smtp_password: '',
        smtp_from_email: '',
        telegram_bot_token: '',
        telegram_chat_id: '',
        notify_email_recipient: '',
        notify_webhook_url: '',
        default_landing_page: 'live',
        global_attach_image_email: true,
        global_attach_image_telegram: true,
        opt_live_view_fps_throttle: 2,
        opt_motion_fps_throttle: 3,
        opt_live_view_height_limit: 720,
        opt_motion_analysis_height: 180,
        opt_live_view_quality: 60,
        opt_snapshot_quality: 90,
        opt_ffmpeg_preset: 'ultrafast',
        opt_pre_capture_fps_throttle: 1,
        opt_verbose_engine_logs: false,
        telemetry_enabled: true,
        default_live_view_mode: 'auto',
        backup_auto_enabled: false,
        backup_auto_frequency_hours: 24,
        backup_auto_retention: 10,
        mqtt_enabled: 'false',
        mqtt_host: '',
        mqtt_port: '1883',
        mqtt_username: '',
        mqtt_password: '',
        mqtt_topic_prefix: 'vibenvr',
        ai_model: 'mobilenet_ssd_v2',
        ai_hardware: 'auto',
        ai_enabled: false
    });

    const [storageStats, setStorageStats] = useState({ used_gb: 0, total_gb: 0 });
    const [orphanSyncStatus, setOrphanSyncStatus] = useState({ isSyncing: false, status: 'idle' });
    const [isReportingTelemetry, setIsReportingTelemetry] = useState(false);

    // User management state
    const [users, setUsers] = useState([]);
    const [cameras, setCameras] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer', email: '' });
    const [isCreatingUser, setIsCreatingUser] = useState(false);

    // Modal states
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdTargetUser, setPwdTargetUser] = useState(null);
    const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '' });
    const [syncResultModal, setSyncResultModal] = useState({ isOpen: false, data: null });

    const toggleSection = (id) => {
        setOpenSection(openSection === id ? null : id);
    };

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/users', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (res.ok) setUsers(await res.json());
        } catch (err) {
            console.error('Failed to fetch users', err);
        }
    }, [token]);

    const fetchCameras = useCallback(async () => {
        try {
            const res = await fetch('/api/cameras', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (res.ok) {
                setCameras(await res.json());
            }
        } catch (err) {
            console.error("Failed to fetch cameras", err);
        }
    }, [token]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/stats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStorageStats(data);
            }
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    }, [token]);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGlobalSettings(prev => ({
                    ...prev,
                    max_global_storage_gb: data.max_global_storage_gb?.value !== undefined ? (parseFloat(data.max_global_storage_gb.value) || 0) : prev.max_global_storage_gb,
                    cleanup_enabled: data.cleanup_enabled?.value !== undefined ? data.cleanup_enabled.value === 'true' : prev.cleanup_enabled,
                    cleanup_interval_hours: data.cleanup_interval_hours?.value !== undefined ? (parseFloat(data.cleanup_interval_hours.value) || 24) : prev.cleanup_interval_hours,
                    smtp_server: data.smtp_server?.value || prev.smtp_server,
                    smtp_port: data.smtp_port?.value || prev.smtp_port,
                    smtp_username: data.smtp_username?.value || prev.smtp_username,
                    smtp_password: data.smtp_password?.value || prev.smtp_password,
                    smtp_from_email: data.smtp_from_email?.value || prev.smtp_from_email,
                    telegram_bot_token: data.telegram_bot_token?.value || prev.telegram_bot_token,
                    telegram_chat_id: data.telegram_chat_id?.value || prev.telegram_chat_id,
                    notify_email_recipient: data.notify_email_recipient?.value || prev.notify_email_recipient,
                    notify_webhook_url: data.notify_webhook_url?.value || prev.notify_webhook_url,
                    default_landing_page: data.default_landing_page?.value || prev.default_landing_page,
                    global_attach_image_email: data.global_attach_image_email?.value !== undefined ? data.global_attach_image_email.value !== 'false' : prev.global_attach_image_email,
                    global_attach_image_telegram: data.global_attach_image_telegram?.value !== undefined ? data.global_attach_image_telegram.value !== 'false' : prev.global_attach_image_telegram,

                    opt_live_view_fps_throttle: data.opt_live_view_fps_throttle?.value !== undefined ? parseInt(data.opt_live_view_fps_throttle.value) : prev.opt_live_view_fps_throttle,
                    opt_motion_fps_throttle: data.opt_motion_fps_throttle?.value !== undefined ? parseInt(data.opt_motion_fps_throttle.value) : prev.opt_motion_fps_throttle,
                    opt_live_view_height_limit: data.opt_live_view_height_limit?.value !== undefined ? parseInt(data.opt_live_view_height_limit.value) : prev.opt_live_view_height_limit,
                    opt_motion_analysis_height: data.opt_motion_analysis_height?.value !== undefined ? parseInt(data.opt_motion_analysis_height.value) : prev.opt_motion_analysis_height,
                    opt_live_view_quality: data.opt_live_view_quality?.value !== undefined ? parseInt(data.opt_live_view_quality.value) : prev.opt_live_view_quality,
                    opt_snapshot_quality: data.opt_snapshot_quality?.value !== undefined ? parseInt(data.opt_snapshot_quality.value) : prev.opt_snapshot_quality,
                    opt_ffmpeg_preset: data.opt_ffmpeg_preset?.value || prev.opt_ffmpeg_preset,
                    opt_pre_capture_fps_throttle: data.opt_pre_capture_fps_throttle?.value !== undefined ? parseInt(data.opt_pre_capture_fps_throttle.value) : prev.opt_pre_capture_fps_throttle,
                    opt_verbose_engine_logs: data.opt_verbose_engine_logs?.value !== undefined ? data.opt_verbose_engine_logs.value === 'true' : prev.opt_verbose_engine_logs,
                    telemetry_enabled: data.telemetry_enabled?.value !== undefined ? data.telemetry_enabled.value !== 'false' : prev.telemetry_enabled,
                    default_live_view_mode: data.default_live_view_mode?.value || prev.default_live_view_mode,
                    backup_auto_enabled: data.backup_auto_enabled?.value !== undefined ? data.backup_auto_enabled.value === 'true' : prev.backup_auto_enabled,
                    backup_auto_frequency_hours: data.backup_auto_frequency_hours?.value !== undefined ? parseInt(data.backup_auto_frequency_hours.value) : prev.backup_auto_frequency_hours,
                    backup_auto_retention: data.backup_auto_retention?.value !== undefined ? parseInt(data.backup_auto_retention.value) : prev.backup_auto_retention,
                    mqtt_enabled: data.mqtt_enabled?.value || prev.mqtt_enabled,
                    mqtt_host: data.mqtt_host?.value || prev.mqtt_host,
                    mqtt_port: data.mqtt_port?.value || prev.mqtt_port,
                    mqtt_username: data.mqtt_username?.value || prev.mqtt_username,
                    mqtt_password: data.mqtt_password?.value || prev.mqtt_password,
                    mqtt_topic_prefix: data.mqtt_topic_prefix?.value || prev.mqtt_topic_prefix,
                    ai_model: data.ai_model?.value || prev.ai_model,
                    ai_hardware: data.ai_hardware?.value || prev.ai_hardware,
                    ai_enabled: data.ai_enabled?.value !== undefined ? data.ai_enabled.value === 'true' : prev.ai_enabled
                }));
            }
        } catch (err) {
            console.error('Failed to fetch settings', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (!token) return;
        fetchSettings();
        fetchStats();
        fetchUsers();
        fetchCameras();
    }, [token, fetchSettings, fetchStats, fetchUsers, fetchCameras]);

    const handleSave = async () => {
        if (user?.role !== 'admin') {
            showToast('Only admins can save settings.', 'error');
            return;
        }

        localStorage.setItem('liveViewColumns', liveViewColumns);

        try {
            await fetch('/api/settings/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    max_global_storage_gb: (globalSettings.max_global_storage_gb || 0).toString(),
                    cleanup_enabled: globalSettings.cleanup_enabled.toString(),
                    cleanup_interval_hours: globalSettings.cleanup_interval_hours.toString(),
                    smtp_server: globalSettings.smtp_server,
                    smtp_port: globalSettings.smtp_port,
                    smtp_username: globalSettings.smtp_username,
                    smtp_password: globalSettings.smtp_password,
                    smtp_from_email: globalSettings.smtp_from_email,
                    telegram_bot_token: globalSettings.telegram_bot_token,
                    telegram_chat_id: globalSettings.telegram_chat_id,
                    notify_email_recipient: globalSettings.notify_email_recipient,
                    notify_webhook_url: globalSettings.notify_webhook_url,

                    default_landing_page: globalSettings.default_landing_page,
                    global_attach_image_email: globalSettings.global_attach_image_email.toString(),
                    global_attach_image_telegram: globalSettings.global_attach_image_telegram.toString(),

                    opt_live_view_fps_throttle: globalSettings.opt_live_view_fps_throttle.toString(),
                    opt_motion_fps_throttle: globalSettings.opt_motion_fps_throttle.toString(),
                    opt_live_view_height_limit: globalSettings.opt_live_view_height_limit.toString(),
                    opt_motion_analysis_height: globalSettings.opt_motion_analysis_height.toString(),
                    opt_live_view_quality: globalSettings.opt_live_view_quality.toString(),
                    opt_snapshot_quality: globalSettings.opt_snapshot_quality.toString(),
                    opt_ffmpeg_preset: globalSettings.opt_ffmpeg_preset,
                    opt_pre_capture_fps_throttle: globalSettings.opt_pre_capture_fps_throttle.toString(),
                    opt_verbose_engine_logs: globalSettings.opt_verbose_engine_logs.toString(),
                    telemetry_enabled: globalSettings.telemetry_enabled.toString(),
                    default_live_view_mode: globalSettings.default_live_view_mode,
                    backup_auto_enabled: globalSettings.backup_auto_enabled.toString(),
                    backup_auto_frequency_hours: globalSettings.backup_auto_frequency_hours.toString(),
                    backup_auto_retention: globalSettings.backup_auto_retention.toString(),
                    mqtt_enabled: globalSettings.mqtt_enabled.toString(),
                    mqtt_host: globalSettings.mqtt_host,
                    mqtt_port: globalSettings.mqtt_port,
                    mqtt_username: globalSettings.mqtt_username,
                    mqtt_password: globalSettings.mqtt_password,
                    mqtt_topic_prefix: globalSettings.mqtt_topic_prefix,
                    ai_model: globalSettings.ai_model,
                    ai_hardware: globalSettings.ai_hardware,
                    ai_enabled: globalSettings.ai_enabled.toString()
                })
            });
            showToast('Settings saved successfully!', 'success');
        } catch (err) {
            showToast('Failed to save settings: ' + err.message, 'error');
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setNewUser({ username: '', password: '', role: 'viewer', email: '' });
                setIsCreatingUser(false);
                fetchUsers();
                showToast('User created successfully', 'success');
            } else {
                const err = await res.json();
                showToast('Failed to create user: ' + err.detail, 'error');
            }
        } catch (err) {
            showToast('Failed to create user: ' + err.message, 'error');
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (pwdForm.new_password !== pwdForm.confirm_password) {
            showToast("New passwords do not match!", "error");
            return;
        }
        const targetId = pwdTargetUser ? pwdTargetUser.id : user.id;

        try {
            const res = await fetch('/api/users/' + targetId + '/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({
                    old_password: pwdTargetUser ? undefined : pwdForm.old_password,
                    new_password: pwdForm.new_password
                })
            });

            if (res.ok) {
                showToast('Password updated successfully', 'success');
                setPwdModalOpen(false);
            } else {
                const err = await res.json();
                showToast('Failed to update password: ' + err.detail, 'error');
            }
        } catch (err) {
            showToast('Failed to update password: ' + err.message, 'error');
        }
    };

    const handleTestNotify = async (channel) => {
        let payload = { channel, settings: {} };

        if (channel === 'email') {
            payload.settings = {
                smtp_server: globalSettings.smtp_server,
                smtp_port: globalSettings.smtp_port,
                smtp_username: globalSettings.smtp_username,
                smtp_password: globalSettings.smtp_password,
                smtp_from_email: globalSettings.smtp_from_email,
                recipient: globalSettings.notify_email_recipient
            };
        } else if (channel === 'telegram') {
            payload.settings = {
                telegram_bot_token: globalSettings.telegram_bot_token,
                telegram_chat_id: globalSettings.telegram_chat_id
            };
        } else if (channel === 'webhook') {
            payload.settings = {
                notify_webhook_url: globalSettings.notify_webhook_url
            };
        }

        try {
            const res = await fetch('/api/settings/test-notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
            } else {
                showToast('Test Failed: ' + data.detail, 'error');
            }
        } catch (err) {
            showToast('Test Failed: ' + err.message, 'error');
        }
    };

    const handleManualTelemetry = async () => {
        setIsReportingTelemetry(true);
        try {
            const res = await fetch('/api/settings/telemetry/report', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token }
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Telemetry report sent successfully!', 'success');
            } else {
                showToast('Failed to trigger telemetry: ' + data.detail, 'error');
            }
        } catch (err) {
            showToast('Failed to trigger telemetry: ' + err.message, 'error');
        } finally {
            setIsReportingTelemetry(false);
        }
    };

    const handleExport = async () => {
        try {
            const res = await fetch('/api/settings/backup/export', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const disposition = res.headers.get('Content-Disposition');
            let filename = `vibenvr_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
            if (disposition && disposition.includes('filename=')) {
                filename = disposition.split('filename=')[1].replace(/"/g, '');
            }
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast("Backup exported successfully", "success");
        } catch (err) {
            showToast("Export failed: " + err.message, "error");
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setConfirmConfig({
            isOpen: true,
            title: 'Import Configuration',
            message: 'Are you sure you want to restore this backup? Current settings and camera configurations will be overwritten or merged. This action cannot be undone.',
            onConfirm: async () => {
                setConfirmConfig({ isOpen: false });
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const res = await fetch('/api/settings/backup/import', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                        body: formData
                    });
                    if (res.ok) {
                        showToast("Backup imported successfully! Reloading...", "success");
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        const err = await res.json();
                        showToast("Import failed: " + err.detail, "error");
                    }
                } catch (err) {
                    showToast("Import failed: " + err.message, "error");
                }
            },
            onCancel: () => {
                setConfirmConfig({ isOpen: false });
                if (e.target) e.target.value = null;
            }
        });
    };

    const openPasswordModal = (targetUser = null) => {
        setPwdTargetUser(targetUser);
        setPwdForm({ old_password: '', new_password: '', confirm_password: '' });
        setPwdModalOpen(true);
    };

    if (loading) {
        return <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>;
    }

    const occupationPercent = globalSettings.max_global_storage_gb > 0
        ? (storageStats.storage?.used_gb / globalSettings.max_global_storage_gb) * 100
        : 0;

    return (
        <div className="space-y-12 relative w-full pb-52 min-w-0 max-w-full overflow-hidden">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground mt-2">Configure your VibeNVR preferences.</p>
            </div>

            <div className="space-y-6">
                {user?.role === 'admin' && (
                    <UserManager
                        users={users}
                        newUser={newUser}
                        setNewUser={setNewUser}
                        isCreatingUser={isCreatingUser}
                        setIsCreatingUser={setIsCreatingUser}
                        handleCreateUser={handleCreateUser}
                        openPasswordModal={openPasswordModal}
                        setConfirmConfig={setConfirmConfig}
                        showToast={showToast}
                        fetchUsers={fetchUsers}
                        currentUser={user}
                        token={token}
                        isOpen={openSection === 'users'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <StorageManager
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        storageStats={storageStats}
                        occupationPercent={occupationPercent}
                        orphanSyncStatus={orphanSyncStatus}
                        setOrphanSyncStatus={setOrphanSyncStatus}
                        setConfirmConfig={setConfirmConfig}
                        showToast={showToast}
                        fetchStats={fetchStats}
                        token={token}
                        currentUser={user}
                        cameras={cameras}
                        isOpen={openSection === 'storage'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <ApiTokenSettings
                        isOpen={openSection === 'api-tokens'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <PrivacySettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        handleManualTelemetry={handleManualTelemetry}
                        isReportingTelemetry={isReportingTelemetry}
                        isOpen={openSection === 'privacy'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <LiveViewLayoutSettings
                        liveViewColumns={liveViewColumns}
                        setLiveViewColumns={setLiveViewColumns}
                        isOpen={openSection === 'liveview'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <GeneralSettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        isOpen={openSection === 'general'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <NotificationSettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        handleTestNotify={handleTestNotify}
                        isOpen={openSection === 'notifications'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <MqttSettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        isOpen={openSection === 'mqtt'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <AISettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        isOpen={openSection === 'ai-settings'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <AdvancedSettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        isOpen={openSection === 'advanced'}
                        onToggle={toggleSection}
                    />
                )}

                {user?.role === 'admin' && (
                    <BackupSettings
                        globalSettings={globalSettings}
                        setGlobalSettings={setGlobalSettings}
                        handleExport={handleExport}
                        handleImport={handleImport}
                        isOpen={openSection === 'backup'}
                        onToggle={toggleSection}
                    />
                )}
            </div>

            {user?.role === 'admin' && (
                <div className="fixed bottom-6 inset-x-5 sm:inset-x-auto sm:right-8 z-50 flex justify-center sm:justify-end pointer-events-none">
                    <button
                        onClick={handleSave}
                        className="pointer-events-auto h-12 flex items-center justify-center space-x-3 bg-primary text-primary-foreground px-10 rounded-xl hover:bg-primary/90 transition-all active:scale-95 font-bold text-base shadow-2xl shadow-primary/30 border border-primary/20 ring-4 ring-background/50 backdrop-blur-sm"
                    >
                        <Save className="w-5 h-5" />
                        <span>Save Settings</span>
                    </button>
                </div>
            )}

            <PasswordChangeModal
                isOpen={pwdModalOpen}
                onClose={() => setPwdModalOpen(false)}
                pwdTargetUser={pwdTargetUser}
                pwdForm={pwdForm}
                setPwdForm={setPwdForm}
                handlePasswordUpdate={handlePasswordUpdate}
            />

            <SyncResultModal
                isOpen={syncResultModal.isOpen}
                data={syncResultModal.data}
                onClose={() => setSyncResultModal({ isOpen: false, data: null })}
            />

            <ConfirmModal
                {...confirmConfig}
                onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
            />
        </div>
    );
};
