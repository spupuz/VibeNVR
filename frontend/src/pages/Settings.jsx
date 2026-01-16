
import React, { useState, useEffect } from 'react';
import { Monitor, Save, HardDrive, Clock, Trash2, Users, Plus, X, Key } from 'lucide-react';
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
        cleanup_interval_hours: 24
    });
    const [storageStats, setStorageStats] = useState({ used_gb: 0, total_gb: 0, percent: 0 });
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    // User Management State
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer', email: '' });
    const [isCreatingUser, setIsCreatingUser] = useState(false);

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
            const res = await fetch('http://localhost:5000/users/', {
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
            const res = await fetch('http://localhost:5000/users/', {
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
                    const res = await fetch('http://localhost:5000/users/' + userId, {
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
            const res = await fetch('http://localhost:5000/users/' + targetId + '/password', {
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
            const res = await fetch('http://localhost:5000/stats/', {
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
            const res = await fetch('http://localhost:5000/settings/', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGlobalSettings({
                    max_global_storage_gb: parseFloat(data.max_global_storage_gb?.value) || 0,
                    cleanup_enabled: data.cleanup_enabled?.value === 'true',
                    cleanup_interval_hours: parseInt(data.cleanup_interval_hours?.value) || 24
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
            await fetch('http://localhost:5000/settings/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    max_global_storage_gb: globalSettings.max_global_storage_gb.toString(),
                    cleanup_enabled: globalSettings.cleanup_enabled.toString(),
                    cleanup_interval_hours: globalSettings.cleanup_interval_hours.toString()
                })
            });
            showToast('Settings saved successfully!', 'success');
        } catch (err) {
            showToast('Failed to save settings: ' + err.message, 'error');
        }
    };

    const initDefaults = async () => {
        try {
            await fetch('http://localhost:5000/settings/init-defaults', {
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
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                <div className="flex items-center justify-between">
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
                <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-border">
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

                    <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left">
                                <tr>
                                    <th className="p-3 font-medium text-muted-foreground">Username</th>
                                    <th className="p-3 font-medium text-muted-foreground">Role</th>
                                    <th className="p-3 font-medium text-muted-foreground">Created</th>
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
                                        <td className="p-3 text-muted-foreground">
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
            <div className={'bg-card border border-border rounded-xl p-6 space-y-6 ' + (user?.role !== 'admin' ? 'opacity-50 pointer-events-none' : '')}>
                <div className="flex items-center space-x-3 pb-4 border-b border-border">
                    <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                        <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Storage Management</h3>
                        <p className="text-sm text-muted-foreground">Control disk space usage for recordings</p>
                    </div>
                </div>
                {user?.role !== 'admin' && <div className="text-red-500 text-sm mb-2 font-bold">Read Only (Admin required)</div>}

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
                            disabled={user?.role !== 'admin'}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Set total storage limit for all cameras. 0 = unlimited. When exceeded, oldest recordings are deleted.
                        </p>
                    </div>

                    <div className="flex items-center justify-between max-w-xs">
                        <label className="text-sm font-medium">Enable Automatic Cleanup</label>
                        <button
                            type="button"
                            disabled={user?.role !== 'admin'}
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
                            disabled={user?.role !== 'admin'}
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
            </div>

            {/* Live View Settings */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
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

            {/* Clean Up Button */}
            <div className={'bg-card border border-border rounded-xl p-6 space-y-4 ' + (user?.role !== 'admin' ? 'opacity-50 pointer-events-none' : '')}>
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                        <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Maintenance</h3>
                        <p className="text-sm text-muted-foreground">Manual system maintenance tasks</p>
                    </div>
                </div>
                <div>
                    <button
                        onClick={async () => {
                            setConfirmConfig({
                                isOpen: true,
                                title: 'Manual Cleanup',
                                message: 'Are you sure you want to trigger storage cleanup now? This will scan all camera folders and delete recordings that exceed set limits.',
                                onConfirm: async () => {
                                    try {
                                        await fetch('http://localhost:5000/settings/cleanup', {
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
                        className="flex items-center space-x-2 bg-amber-500 text-white px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Clean Up Storage Now</span>
                    </button>
                    <p className="text-xs text-muted-foreground mt-2">
                        This will force an immediate check and deletion of recordings that exceed your storage limits or retention periods.
                    </p>
                </div>
            </div>

            {/* Save Button */}
            {user?.role === 'admin' && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        className="flex items-center space-x-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        <span>Save Settings</span>
                    </button>
                </div>
            )}
            <ConfirmModal {...confirmConfig} />
        </div>
    );
};
