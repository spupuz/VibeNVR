
import React, { useState, useEffect } from 'react';
import { Monitor, Save, HardDrive, Clock, Trash2, Users, Plus, X, Key, Bell, Download, Upload, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/Button';

export const Settings = () => {
    const { user, token } = useAuth();
    const [liveViewColumns, setLiveViewColumns] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    // Global settings from backend
    const [globalSettings, setGlobalSettings] = useState({
        max_global_storage_gb: 0,
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
        default_landing_page: 'live',
        global_attach_image_email: true,
        global_attach_image_telegram: true,

        // Advanced
        opt_live_view_fps_throttle: 2,
        opt_motion_fps_throttle: 3,
        opt_live_view_height_limit: 720,
        opt_motion_analysis_height: 180,
        opt_live_view_quality: 60,
        opt_snapshot_quality: 90,
        opt_snapshot_quality: 90,
        opt_ffmpeg_preset: 'ultrafast',
        opt_pre_capture_fps_throttle: 1,
        opt_verbose_engine_logs: false
    });
    const [storageStats, setStorageStats] = useState({ used_gb: 0, total_gb: 0, percent: 0 });
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    // User Management State
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer', email: '' });

    const [isCreatingUser, setIsCreatingUser] = useState(false);

    // Orphan Sync State
    const [orphanSyncStatus, setOrphanSyncStatus] = useState({ isSyncing: false, status: 'idle' });
    const [syncResultModal, setSyncResultModal] = useState({ isOpen: false, data: null });

    // Poll for status when syncing
    useEffect(() => {
        let interval;
        if (orphanSyncStatus.isSyncing) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch('/api/settings/sync-orphans/status', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();

                        // Handle server restart case (status went back to idle unexpectedly)
                        if (data.status === 'idle') {
                            setOrphanSyncStatus({ isSyncing: false, status: 'idle' });
                            showToast('Sync task interrupted (server restart). Please try again.', 'error');
                            clearInterval(interval);
                            return;
                        }

                        // Only update if status changes or completes
                        if (data.status === 'completed' || data.status === 'error') {
                            setOrphanSyncStatus({ isSyncing: false, status: data.status });
                            setSyncResultModal({ isOpen: true, data: data.result });
                            clearInterval(interval);
                        }
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [orphanSyncStatus.isSyncing, token]);

    // Password Change State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdTargetUser, setPwdTargetUser] = useState(null); // If null, it's "Self"
    const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm_password: '' });

    const occupationPercent = globalSettings.max_global_storage_gb > 0
        ? (storageStats.used_gb / globalSettings.max_global_storage_gb) * 100
        : storageStats.percent;

    useEffect(() => {
        if (!token) return;
        fetchSettings();
        fetchStats();
        if (user?.role === 'admin') {
            fetchUsers();
        }
    }, [user, token]);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (res.ok) {
                setUsers(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch users', err);
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

    const handleDeleteUser = async (userId) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete User',
            message: 'Are you sure you want to delete this user? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    const res = await fetch('/api/users/' + userId, {
                        method: 'DELETE',
                        headers: { Authorization: 'Bearer ' + token }
                    });
                    if (res.ok) {
                        fetchUsers();
                        showToast('User deleted successfully', 'success');
                    } else {
                        const err = await res.json();
                        showToast('Failed to delete user: ' + err.detail, 'error');
                    }
                } catch (err) {
                    showToast('Failed to delete user: ' + err.message, 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const openPasswordModal = (targetUser = null) => {
        setPwdTargetUser(targetUser); // If null, changing own password
        setPwdForm({ old_password: '', new_password: '', confirm_password: '' });
        setPwdModalOpen(true);
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
                    old_password: pwdTargetUser ? undefined : pwdForm.old_password, // Admin override doesn't send old_password
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

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/stats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStorageStats(data.storage);
            }
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGlobalSettings({
                    max_global_storage_gb: parseFloat(data.max_global_storage_gb?.value) || 0,
                    cleanup_enabled: data.cleanup_enabled?.value === 'true',
                    cleanup_interval_hours: parseInt(data.cleanup_interval_hours?.value) || 24,
                    smtp_server: data.smtp_server?.value || '',
                    smtp_port: data.smtp_port?.value || '587',
                    smtp_username: data.smtp_username?.value || '',
                    smtp_password: data.smtp_password?.value || '',
                    smtp_from_email: data.smtp_from_email?.value || '',
                    telegram_bot_token: data.telegram_bot_token?.value || '',
                    telegram_chat_id: data.telegram_chat_id?.value || '',
                    notify_email_recipient: data.notify_email_recipient?.value || '',
                    default_landing_page: data.default_landing_page?.value || 'live',
                    global_attach_image_email: data.global_attach_image_email?.value !== 'false',
                    global_attach_image_telegram: data.global_attach_image_telegram?.value !== 'false',

                    opt_live_view_fps_throttle: parseInt(data.opt_live_view_fps_throttle?.value) || 2,
                    opt_motion_fps_throttle: parseInt(data.opt_motion_fps_throttle?.value) || 3,
                    opt_live_view_height_limit: parseInt(data.opt_live_view_height_limit?.value) || 720,
                    opt_motion_analysis_height: parseInt(data.opt_motion_analysis_height?.value) || 180,
                    opt_live_view_quality: parseInt(data.opt_live_view_quality?.value) || 60,
                    opt_snapshot_quality: parseInt(data.opt_snapshot_quality?.value) || 90,
                    opt_snapshot_quality: parseInt(data.opt_snapshot_quality?.value) || 90,
                    opt_ffmpeg_preset: data.opt_ffmpeg_preset?.value || 'ultrafast',
                    opt_pre_capture_fps_throttle: parseInt(data.opt_pre_capture_fps_throttle?.value) || 1,
                    opt_verbose_engine_logs: data.opt_verbose_engine_logs?.value === 'true'
                });
            }
        } catch (err) {
            console.error('Failed to fetch settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (user?.role !== 'admin') {
            showToast('Only admins can save settings.', 'error');
            return;
        }

        // Save localStorage settings
        localStorage.setItem('liveViewColumns', liveViewColumns);

        // Save backend settings
        try {
            await fetch('/api/settings/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    max_global_storage_gb: globalSettings.max_global_storage_gb.toString(),
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
                    opt_verbose_engine_logs: globalSettings.opt_verbose_engine_logs.toString()
                })
            });
            showToast('Settings saved successfully!', 'success');
        } catch (err) {
            showToast('Failed to save settings: ' + err.message, 'error');
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

            // Try to get filename from header
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
            confirmText: 'Import Now',
            variant: 'primary',
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


    const initDefaults = async () => {
        try {
            await fetch('/api/settings/init-defaults', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchSettings();
        } catch (err) {
            console.error('Failed to init defaults', err);
        }
    };

    useEffect(() => {
        if (!token) return;
        initDefaults();
    }, [token]);

    return (
        <div className="space-y-8 relative">
            {/* Password Modal */}
            {pwdModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold">
                                {pwdTargetUser ? 'Reset Password for ' + pwdTargetUser.username : 'Change My Password'}
                            </h3>
                            <button onClick={() => setPwdModalOpen(false)}><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handlePasswordUpdate} className="space-y-4">
                            {!pwdTargetUser && (
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Old Password</label>
                                    <input
                                        type="password"
                                        className="w-full bg-background border border-input rounded px-3 py-2"
                                        required
                                        value={pwdForm.old_password}
                                        onChange={e => setPwdForm({ ...pwdForm, old_password: e.target.value })}
                                    />
                                </div>
                            )}
                            <div>
                                <label className="text-sm font-medium mb-1 block">New Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-background border border-input rounded px-3 py-2"
                                    required
                                    value={pwdForm.new_password}
                                    onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-background border border-input rounded px-3 py-2"
                                    required
                                    value={pwdForm.confirm_password}
                                    onChange={e => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setPwdModalOpen(false)}>Cancel</Button>
                                <Button type="submit">Update Password</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground mt-2">Configure your VibeNVR preferences.</p>
            </div>

            {/* My Account Section (Visible to everyone) */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">My Account</h3>
                            <p className="text-sm text-muted-foreground">Manage your profile ({user?.username})</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openPasswordModal(null)}>
                        <Key className="w-4 h-4 mr-2" />
                        Change Password
                    </Button>
                </div>
            </div>

            {/* User Management (Admin Only) */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">User Management</h3>
                                <p className="text-sm text-muted-foreground">Manage system access and roles</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsCreatingUser(!isCreatingUser)}
                            className="flex items-center gap-2"
                        >
                            {isCreatingUser ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {isCreatingUser ? 'Cancel' : 'Add User'}
                        </Button>
                    </div>

                    {isCreatingUser && (
                        <form onSubmit={handleCreateUser} className="bg-muted/30 p-4 rounded-lg border border-border space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium mb-1 block">Username</label>
                                    <input
                                        type="text"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        required
                                        value={newUser.username}
                                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium mb-1 block">Email</label>
                                    <input
                                        type="email"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={newUser.email}
                                        onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium mb-1 block">Password</label>
                                    <input
                                        type="password"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        required
                                        value={newUser.password}
                                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium mb-1 block">Role</label>
                                    <select
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={newUser.role}
                                        onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        <option value="viewer">Viewer (Read Only)</option>
                                        <option value="admin">Admin (Full Access)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" size="sm">Create User</Button>
                            </div>
                        </form>
                    )}

                    <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left">
                                <tr>
                                    <th className="p-3 font-medium text-muted-foreground">Username</th>
                                    <th className="p-3 font-medium text-muted-foreground">Role</th>
                                    <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Created</th>
                                    <th className="p-3 font-medium text-muted-foreground text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-t border-border hover:bg-muted/10">
                                        <td className="p-3 font-medium flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold">
                                                {u.username[0].toUpperCase()}
                                            </div>
                                            {u.username}
                                            {u.id === user.id && <span className="text-[10px] bg-primary/20 text-primary px-1.5 rounded">You</span>}
                                        </td>
                                        <td className="p-3">
                                            <span className={'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' +
                                                (u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800')
                                            }>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground hidden sm:table-cell">
                                            {new Date(u.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-3 text-right flex justify-end gap-1">
                                            <button
                                                onClick={() => openPasswordModal(u)}
                                                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                                                title="Change Password"
                                            >
                                                <Key className="w-4 h-4" />
                                            </button>
                                            {u.id !== user.id && (
                                                <button
                                                    onClick={() => handleDeleteUser(u.id)}
                                                    className="p-1.5 hover:bg-red-100 text-red-500 rounded transition-colors"
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr><td colSpan="4" className="p-4 text-center text-muted-foreground">No users found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Storage Settings */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-border">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <HardDrive className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Storage Management</h3>
                            <p className="text-sm text-muted-foreground">Control disk space usage for recordings</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Storage Occupation Display */}
                        <div className="bg-muted/30 rounded-lg p-4 mb-4 border border-border/50">
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-sm font-medium">Storage Occupation</span>
                                <span className="text-xs text-muted-foreground">
                                    {storageStats.used_gb} GB / {globalSettings.max_global_storage_gb > 0 ? globalSettings.max_global_storage_gb : storageStats.total_gb} GB
                                    ({Math.round(occupationPercent)}%)
                                </span>
                            </div>
                            <div className="w-full h-3 bg-background rounded-full border border-border overflow-hidden">
                                <div
                                    className={'h-full transition-all duration-500 rounded-full ' +
                                        (occupationPercent > 90 ? 'bg-red-500' : occupationPercent > 70 ? 'bg-amber-500' : 'bg-green-500')
                                    }
                                    style={{ width: Math.min(occupationPercent, 100) + '%' }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 italic">
                                {globalSettings.max_global_storage_gb > 0
                                    ? 'Currently using ' + storageStats.used_gb + ' GB of your ' + globalSettings.max_global_storage_gb + ' GB limit.'
                                    : 'Total disk usage. No global limit set.'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Maximum Global Storage (GB)</label>
                            <input
                                type="number"
                                value={globalSettings.max_global_storage_gb}
                                onChange={(e) => setGlobalSettings({ ...globalSettings, max_global_storage_gb: parseFloat(e.target.value) || 0 })}
                                className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                                min="0"
                                step="1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Set total storage limit for all cameras. 0 = unlimited. When exceeded, oldest recordings are deleted.
                            </p>
                        </div>

                        <div className="flex items-center justify-between max-w-xs">
                            <label className="text-sm font-medium">Enable Automatic Cleanup</label>
                            <button
                                type="button"
                                onClick={() => setGlobalSettings({ ...globalSettings, cleanup_enabled: !globalSettings.cleanup_enabled })}
                                className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                                    (globalSettings.cleanup_enabled ? 'bg-primary' : 'bg-muted')
                                }
                            >
                                <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ' +
                                    (globalSettings.cleanup_enabled ? 'translate-x-6' : 'translate-x-1')
                                } />
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Cleanup Interval (Hours)</label>
                            <select
                                value={globalSettings.cleanup_interval_hours}
                                onChange={(e) => setGlobalSettings({ ...globalSettings, cleanup_interval_hours: parseInt(e.target.value) })}
                                className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                            >
                                <option value="1">Every Hour</option>
                                <option value="6">Every 6 Hours</option>
                                <option value="12">Every 12 Hours</option>
                                <option value="24">Every 24 Hours</option>
                                <option value="48">Every 2 Days</option>
                                <option value="168">Every Week</option>
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">
                                How often to check and clean up old recordings
                            </p>
                        </div>
                    </div>

                    {/* Bulk Delete Section */}
                    {user?.role === 'admin' && (
                        <div className="pt-4 border-t border-border mt-4">
                            <h4 className="text-sm font-semibold mb-3">Bulk Deletion</h4>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                                    onClick={() => setConfirmConfig({
                                        isOpen: true,
                                        title: 'Delete All Videos',
                                        message: 'Are you sure you want to delete ALL video recordings? This action cannot be undone and will free up disk space.',
                                        onConfirm: async () => {
                                            try {
                                                const res = await fetch('/api/events/bulk/all?event_type=video', {
                                                    method: 'DELETE',
                                                    headers: { Authorization: 'Bearer ' + token }
                                                });
                                                const data = await res.json();
                                                showToast(`Deleted ${data.deleted_count} videos (${data.deleted_size_mb} MB)`, 'success');
                                                fetchStats();
                                            } catch (e) {
                                                showToast('Failed to delete videos', 'error');
                                            }
                                            setConfirmConfig({ isOpen: false });
                                        }
                                    })}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete All Videos
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                                    onClick={() => setConfirmConfig({
                                        isOpen: true,
                                        title: 'Delete All Pictures',
                                        message: 'Are you sure you want to delete ALL picture snapshots? This action cannot be undone.',
                                        onConfirm: async () => {
                                            try {
                                                const res = await fetch('/api/events/bulk/all?event_type=picture', {
                                                    method: 'DELETE',
                                                    headers: { Authorization: 'Bearer ' + token }
                                                });
                                                const data = await res.json();
                                                showToast(`Deleted ${data.deleted_count} pictures (${data.deleted_size_mb} MB)`, 'success');
                                                fetchStats();
                                            } catch (e) {
                                                showToast('Failed to delete pictures', 'error');
                                            }
                                            setConfirmConfig({ isOpen: false });
                                        }
                                    })}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete All Pictures
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Live View Settings */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-border">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Monitor className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Live View Layout</h3>
                            <p className="text-sm text-muted-foreground">Customize how cameras are displayed</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Grid Columns</label>
                            <select
                                value={liveViewColumns}
                                onChange={(e) => setLiveViewColumns(e.target.value)}
                                className="w-full max-w-xs bg-background border border-input rounded-lg px-3 py-2"
                            >
                                <option value="auto">Auto (Based on camera count)</option>
                                <option value="1">1 Column</option>
                                <option value="2">2 Columns</option>
                                <option value="3">3 Columns</option>
                                <option value="4">4 Columns</option>
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">
                                Choose how many columns to display in the Live View grid
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* General Preferences */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-border">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <SettingsIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">General Preferences</h3>
                            <p className="text-sm text-muted-foreground">Configure global application defaults</p>
                        </div>
                    </div>

                    <div className="max-w-xs">
                        <label className="block text-sm font-medium mb-1">Default Landing Page</label>
                        <select
                            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
                            value={globalSettings.default_landing_page}
                            onChange={(e) => setGlobalSettings({ ...globalSettings, default_landing_page: e.target.value })}
                        >
                            <option value="dashboard">Dashboard</option>
                            <option value="live">Live View</option>
                            <option value="timeline">Timeline</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1">Which page to show first when opening the application</p>
                    </div>
                </div>
            )}

            {/* Notification Settings */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-border">
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                            <Bell className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Notification Settings</h3>
                            <p className="text-sm text-muted-foreground">Configure global Email and Telegram credentials</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* SMTP Section */}
                        <div>
                            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">SMTP (Email) Configuration</h4>
                            <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-2 rounded-lg border border-border/50">
                                <span className="font-semibold text-primary">Note:</span> These global credentials will be used for all cameras unless a camera specifically overrides them in its own settings.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-xs font-medium mb-1">SMTP Server</label>
                                    <input
                                        type="text"
                                        placeholder="smtp.gmail.com"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={globalSettings.smtp_server}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, smtp_server: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-xs font-medium mb-1">SMTP Port</label>
                                    <input
                                        type="text"
                                        placeholder="587"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={globalSettings.smtp_port}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, smtp_port: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Username</label>
                                    <input
                                        type="text"
                                        placeholder="user@example.com"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={globalSettings.smtp_username}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, smtp_username: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Password</label>
                                    <input
                                        type="password"
                                        placeholder="App Password"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={globalSettings.smtp_password}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, smtp_password: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium mb-1">Sender Email ("From")</label>
                                    <input
                                        type="email"
                                        placeholder="nvr@yourdomain.com"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                        value={globalSettings.smtp_from_email}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, smtp_from_email: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Telegram Section */}
                        <div className="pt-4 border-t border-border/50">
                            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Telegram Configuration</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Bot Token</label>
                                    <input
                                        type="password"
                                        placeholder="123456:ABC-DEF..."
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm font-mono"
                                        value={globalSettings.telegram_bot_token}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, telegram_bot_token: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">Global Default. Can be overridden per camera.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Global Chat ID</label>
                                    <input
                                        type="text"
                                        placeholder="-100123456789"
                                        className="w-full bg-background border border-input rounded px-3 py-2 text-sm font-mono"
                                        value={globalSettings.telegram_chat_id}
                                        onChange={(e) => setGlobalSettings({ ...globalSettings, telegram_chat_id: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">Default destination for all cameras. Specific cameras can override this.</p>
                                </div>
                            </div>
                        </div>

                        {/* Defaults section inside Notifications */}
                        <div className="pt-4 border-t border-border/50">
                            <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Notification Defaults</h4>
                            <div className="max-w-md">
                                <label className="block text-xs font-medium mb-1">Default Email Recipient</label>
                                <input
                                    type="email"
                                    placeholder="admin@example.com"
                                    className="w-full bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.notify_email_recipient}
                                    onChange={(e) => setGlobalSettings({ ...globalSettings, notify_email_recipient: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Used if a camera doesn't specify a recipient</p>
                            </div>

                            <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between max-w-sm">
                                    <label className="text-sm font-medium">Attach Snapshot to Email (Global)</label>
                                    <button
                                        type="button"
                                        onClick={() => setGlobalSettings({ ...globalSettings, global_attach_image_email: !globalSettings.global_attach_image_email })}
                                        className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                                            (globalSettings.global_attach_image_email ? 'bg-primary' : 'bg-muted')
                                        }
                                    >
                                        <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ' +
                                            (globalSettings.global_attach_image_email ? 'translate-x-6' : 'translate-x-1')
                                        } />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between max-w-sm">
                                    <label className="text-sm font-medium">Attach Snapshot to Telegram (Global)</label>
                                    <button
                                        type="button"
                                        onClick={() => setGlobalSettings({ ...globalSettings, global_attach_image_telegram: !globalSettings.global_attach_image_telegram })}
                                        className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                                            (globalSettings.global_attach_image_telegram ? 'bg-primary' : 'bg-muted')
                                        }
                                    >
                                        <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ' +
                                            (globalSettings.global_attach_image_telegram ? 'translate-x-6' : 'translate-x-1')
                                        } />
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Default behavior for image attachments in notifications</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-4">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <Trash2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Maintenance</h3>
                            <p className="text-sm text-muted-foreground">Manual system maintenance tasks</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <button
                                onClick={async () => {
                                    setConfirmConfig({
                                        isOpen: true,
                                        title: 'Manual Cleanup',
                                        message: 'Are you sure you want to trigger storage cleanup now? This will scan all camera folders and delete recordings that exceed set limits.',
                                        onConfirm: async () => {
                                            try {
                                                await fetch('/api/settings/cleanup', {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                showToast('Cleanup triggered successfully!', 'success');
                                                fetchStats();
                                            } catch (err) {
                                                showToast('Failed to trigger cleanup: ' + err.message, 'error');
                                            }
                                            setConfirmConfig({ isOpen: false });
                                        },
                                        onCancel: () => setConfirmConfig({ isOpen: false })
                                    });
                                }}
                                className="w-full sm:w-auto h-auto min-h-[44px] whitespace-normal justify-center flex items-center space-x-2 bg-amber-500 text-white px-4 py-3 rounded-lg hover:bg-amber-600 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Clean Up Storage Now</span>
                            </button>
                            <p className="text-xs text-muted-foreground mt-2">
                                This will force an immediate check and deletion of recordings that exceed your storage limits or retention periods.
                            </p>
                        </div>
                        <div>
                            <button
                                onClick={async () => {
                                    setConfirmConfig({
                                        isOpen: true,
                                        title: 'Recover Orphaned Recordings',
                                        message: 'This will scan all camera folders for recordings that exist on disk but are missing from the database, and import them into the timeline. This is useful after system updates or migration.',
                                        onConfirm: async () => {
                                            try {
                                                const res = await fetch('/api/settings/sync-orphans', {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                if (res.status === 429) {
                                                    const data = await res.json();
                                                    showToast(data.detail, 'error');
                                                } else if (res.ok) {
                                                    showToast('Recovery started in background. Please wait...', 'success');
                                                    setOrphanSyncStatus({ isSyncing: true, status: 'running' });
                                                } else {
                                                    const data = await res.json();
                                                    showToast('Recovery failed: ' + data.detail, 'error');
                                                }
                                            } catch (err) {
                                                showToast('Failed to trigger recovery: ' + err.message, 'error');
                                            }
                                            setConfirmConfig({ isOpen: false });
                                        },
                                        onCancel: () => setConfirmConfig({ isOpen: false })
                                    });
                                }}

                                disabled={orphanSyncStatus.isSyncing}
                                className={`w-full sm:w-auto h-auto min-h-[44px] whitespace-normal justify-center flex items-center space-x-2 px-4 py-3 rounded-lg transition-colors ${orphanSyncStatus.isSyncing
                                    ? "bg-blue-400 cursor-not-allowed opacity-75"
                                    : "bg-blue-500 hover:bg-blue-600"
                                    } text-white`}
                            >
                                <HardDrive className={`w-4 h-4 ${orphanSyncStatus.isSyncing ? "animate-pulse" : ""}`} />
                                <span>{orphanSyncStatus.isSyncing ? "Scanning..." : "Recover Orphaned Recordings"}</span>
                            </button>
                            <p className="text-xs text-muted-foreground mt-2">
                                Scans for video files on disk that aren't in the database and imports them into the timeline.
                            </p>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Advanced Optimization Section */}
            {user?.role === 'admin' && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-border">
                        <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                            <SettingsIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Advanced Optimization</h3>
                            <p className="text-sm text-muted-foreground">Fine-tune performance parameters for CPU and Bandwidth control.</p>
                        </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 p-4 rounded-lg text-sm">
                        <strong className="flex items-center gap-2">WARNING:</strong>
                        Changing these values can significantly impact system stability and resource usage.
                        Only modify these if you are experiencing performance issues or running on low-end hardware.
                        Incorrect settings may cause video lag, broken streams, or high CPU usage.
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {/* Live View Throttling */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Live View FPS Throttle (Nth Frame)</label>
                                <p className="text-xs text-muted-foreground">
                                    Controls how often the Live View stream is updated.
                                    Setting this to <strong>2</strong> means only every 2nd frame is processed for the browser (effective 15fps if camera is 30fps).
                                    <br /><br />
                                    <strong>Higher value = Less CPU usage</strong>, but choppier live video.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="1" max="10"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_live_view_fps_throttle}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_live_view_fps_throttle: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 2 (Process 50% of frames)</p>
                            </div>
                        </div>

                        {/* Motion Throttling */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Motion Detection FPS Throttle</label>
                                <p className="text-xs text-muted-foreground">
                                    Controls how often the motion detection algorithm runs.
                                    Setting this to <strong>3</strong> means motion is only checked every 3rd frame.
                                    <br /><br />
                                    <strong>Higher value = Much Less CPU usage</strong>.
                                    Too high (e.g. &gt; 5) might miss very fast moving objects.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="1" max="10"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_motion_fps_throttle}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_motion_fps_throttle: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 3 (Process 33% of frames)</p>
                            </div>
                        </div>

                        {/* Pre-Capture Throttling */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Pre-Capture Buffer FPS divisor</label>
                                <p className="text-xs text-muted-foreground">
                                    Reduces the RAM usage of the pre-trigger buffer by storing fewer frames.
                                    Setting this to <strong>2</strong> means only every 2nd frame is buffered (saving 50% RAM), but early seconds of recording will be less fluid.
                                    <br /><br />
                                    <strong>Higher value = Less RAM usage</strong>.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="1" max="10"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_pre_capture_fps_throttle}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_pre_capture_fps_throttle: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 1 (Full FPS)</p>
                            </div>
                        </div>

                        {/* Live View Height */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Live View Resolution Limit (Height)</label>
                                <p className="text-xs text-muted-foreground">
                                    If a camera's resolution is higher than this (e.g. 1080p), it will be downscaled for the Live View stream in the browser.
                                    Recording quality is NOT affected.
                                    <br /><br />
                                    <strong>Lower value (e.g. 480 or 720) = Much Lower Bandwidth & CPU</strong>.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="240" max="2160" step="2"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_live_view_height_limit}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_live_view_height_limit: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 720 (720p)</p>
                            </div>
                        </div>

                        {/* Motion Analysis Height */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Motion Analysis Resolution (Height)</label>
                                <p className="text-xs text-muted-foreground">
                                    Internal resolution used <i>strictly</i> for detecting motion. Does not affect recording or live view.
                                    The engine resizes the frame to this height before comparing pixels.
                                    <br /><br />
                                    <strong>Smaller = Faster CPU processing</strong>.
                                    180px is usually enough for human detection.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="64" max="1080" step="2"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_motion_analysis_height}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_motion_analysis_height: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 180 (Very Low Res)</p>
                            </div>
                        </div>

                        {/* Live View Quality */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Live View JPEG Quality</label>
                                <p className="text-xs text-muted-foreground">
                                    Compression level for the specific Live View stream.
                                    <br /><br />
                                    <strong>Lower (e.g. 50-60) = Less Bandwidth</strong>, faster loading.
                                    <strong>Higher (90+) = Better looking live view</strong> but higher bandwidth.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="10" max="100"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_live_view_quality}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_live_view_quality: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 60 (Balanced)</p>
                            </div>
                        </div>

                        {/* Snapshot Quality */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Events Snapshot Quality</label>
                                <p className="text-xs text-muted-foreground">
                                    Quality of the static JPEG images saved during motion events.
                                    <br /><br />
                                    <strong>Higher = Clearer images</strong> for identification.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="10" max="100"
                                    className="w-full max-w-[150px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_snapshot_quality}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_snapshot_quality: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Default: 90 (High Quality)</p>
                            </div>
                        </div>

                        {/* FFMPEG Preset */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">FFMPEG Transcoding Preset</label>
                                <p className="text-xs text-muted-foreground">
                                    Determines how much CPU FFMPEG uses to compress video when transcoding is required (not using Passthrough).
                                    <br /><br />
                                    <strong>Ultrafast = Lowest CPU usage</strong>, but larger file sizes or lower quality.
                                    <strong>Medium = High CPU usage</strong>, smaller file sizes.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <select
                                    className="w-full max-w-[200px] bg-background border border-input rounded px-3 py-2 text-sm"
                                    value={globalSettings.opt_ffmpeg_preset}
                                    onChange={e => setGlobalSettings({ ...globalSettings, opt_ffmpeg_preset: e.target.value })}
                                >
                                    <option value="ultrafast">Ultrafast (Best for CPU)</option>
                                    <option value="superfast">Superfast</option>
                                    <option value="veryfast">Veryfast</option>
                                    <option value="faster">Faster</option>
                                    <option value="fast">Fast</option>
                                    <option value="medium">Medium (Standard)</option>
                                    <option value="slow">Slow (High CPU)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground mt-1">Default: Ultrafast</p>
                            </div>
                        </div>

                        {/* Verbose Logs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/50">
                            <div className="col-span-1">
                                <label className="block text-sm font-medium mb-1">Verbose Engine Logs</label>
                                <p className="text-xs text-muted-foreground">
                                    Enables detailed logs from OpenCV and FFmpeg.
                                    <br /><br />
                                    <strong>Useful for debugging connection issues</strong>, but will clutter the engine logs during normal operation.
                                </p>
                            </div>
                            <div className="col-span-2">
                                <button
                                    type="button"
                                    onClick={() => setGlobalSettings({ ...globalSettings, opt_verbose_engine_logs: !globalSettings.opt_verbose_engine_logs })}
                                    className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                                        (globalSettings.opt_verbose_engine_logs ? 'bg-primary' : 'bg-muted')
                                    }
                                >
                                    <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ' +
                                        (globalSettings.opt_verbose_engine_logs ? 'translate-x-6' : 'translate-x-1')
                                    } />
                                </button>
                                <p className="text-[10px] text-muted-foreground mt-1">Default: Off</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Backup & Restore */}
            {
                user?.role === 'admin' && (
                    <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-4">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                <HardDrive className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">Backup & Restore</h3>
                                <p className="text-sm text-muted-foreground">Export or Import system configuration (Settings, Cameras, Groups)</p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
                            <button
                                onClick={handleExport}
                                className="w-full sm:w-auto h-11 px-6 flex items-center justify-center space-x-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-sm active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export Config</span>
                            </button>

                            <div className="relative w-full sm:w-auto">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleImport}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <button
                                    className="w-full sm:w-auto h-11 px-6 flex items-center justify-center space-x-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm"
                                >
                                    <Upload className="w-4 h-4" />
                                    <span>Import Config</span>
                                </button>
                            </div>

                            <p className="text-[10px] text-muted-foreground w-full mt-1 bg-muted/30 p-2 rounded-lg border border-border/50">
                                * Export includes all cameras, groups, and system settings. Import will merge or overwrite existing configurations.
                            </p>
                        </div>
                    </div>
                )
            }

            {/* Save Button */}
            {
                user?.role === 'admin' && (
                    <div className="flex justify-end">
                        <button
                            onClick={handleSave}
                            className="w-full sm:w-auto h-auto min-h-[44px] whitespace-normal justify-center flex items-center space-x-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            <span>Save Settings</span>
                        </button>
                    </div>
                )
            }
            <ConfirmModal
                {...confirmConfig}
                onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
            />

            {/* Sync Result Modal */}
            {syncResultModal.isOpen && syncResultModal.data && (
                <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative bg-background border rounded-lg shadow-lg max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <HardDrive className="w-5 h-5 text-blue-500" />
                                Recovery Complete
                            </h3>
                            <button
                                onClick={() => setSyncResultModal({ isOpen: false, data: null })}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {syncResultModal.data.error ? (
                                <div className="p-4 bg-red-500/10 text-red-500 rounded-lg">
                                    <p className="font-semibold">Error Occurred</p>
                                    <p className="text-sm">{syncResultModal.data.error}</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                        <span className="font-medium">Recovered Recordings</span>
                                        <span className="font-bold text-green-600 bg-green-100 px-2 py-1 rounded">{syncResultModal.data.imported}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-2 border-b">
                                        <span className="text-muted-foreground">Skipped (Already in DB)</span>
                                        <span className="font-medium">{syncResultModal.data.skipped}</span>
                                    </div>

                                    {(syncResultModal.data.thumbnails_generated > 0) && (
                                        <div className="flex justify-between items-center p-2 border-b">
                                            <span>Thumbnails Generated</span>
                                            <span className="font-medium text-blue-500">{syncResultModal.data.thumbnails_generated}</span>
                                        </div>
                                    )}

                                    {(syncResultModal.data.corrupted_deleted > 0) && (
                                        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mt-2">
                                            <div className="flex items-center gap-2 mb-1 text-amber-700 font-medium">
                                                <Trash2 className="w-3 h-3" />
                                                <span>Corrupted Files Removed</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-amber-600/80 pl-5">
                                                <span>Count: {syncResultModal.data.corrupted_deleted}</span>
                                                <span> Freed: {syncResultModal.data.corrupted_size_mb} MB</span>
                                            </div>
                                        </div>
                                    )}

                                    {(syncResultModal.data.orphaned_deleted > 0) && (
                                        <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mt-2">
                                            <div className="flex items-center gap-2 mb-1 text-red-700 font-medium">
                                                <Trash2 className="w-3 h-3" />
                                                <span>Deleted Camera Files Cleaned</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-red-600/80 pl-5">
                                                <span>Count: {syncResultModal.data.orphaned_deleted}</span>
                                                <span> Freed: {syncResultModal.data.orphaned_size_mb} MB</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <Button
                                onClick={() => setSyncResultModal({ isOpen: false, data: null })}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
