import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Key, Mail, Shield, Upload, X, User as UserIcon } from 'lucide-react';

export const Profile = () => {
    const { user, token, checkAuth } = useAuth();
    const { showToast } = useToast();
    const [uploading, setUploading] = useState(false);

    // Password Change State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm_password: '' });

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('Image size must be less than 5MB', 'error');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`/api/users/${user.id}/avatar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                showToast('Avatar updated successfully', 'success');
                // Refresh user data in context
                await checkAuth();
            } else {
                const err = await res.json();
                showToast('Failed to upload avatar: ' + err.detail, 'error');
            }
        } catch (err) {
            showToast('Failed to upload avatar: ' + err.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (pwdForm.new_password !== pwdForm.confirm_password) {
            showToast("New passwords do not match!", "error");
            return;
        }

        try {
            const res = await fetch('/api/users/' + user.id + '/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({
                    old_password: pwdForm.old_password,
                    new_password: pwdForm.new_password
                })
            });

            if (res.ok) {
                showToast('Password updated successfully', 'success');
                setPwdModalOpen(false);
                setPwdForm({ old_password: '', new_password: '', confirm_password: '' });
            } else {
                const err = await res.json();
                showToast('Failed to update password: ' + err.detail, 'error');
            }
        } catch (err) {
            showToast('Failed to update password: ' + err.message, 'error');
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Password Modal */}
            {pwdModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-border pb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Key className="w-5 h-5 text-primary" />
                                Change Password
                            </h3>
                            <button onClick={() => setPwdModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handlePasswordUpdate} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Current Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    required
                                    value={pwdForm.old_password}
                                    onChange={e => setPwdForm({ ...pwdForm, old_password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">New Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    required
                                    value={pwdForm.new_password}
                                    onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    required
                                    value={pwdForm.confirm_password}
                                    onChange={e => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
                                <Button type="button" variant="outline" onClick={() => setPwdModalOpen(false)}>Cancel</Button>
                                <Button type="submit">Update Password</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div>
                <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
                <p className="text-muted-foreground mt-2">Manage your account settings and preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Avatar Section */}
                <div className="col-span-1">
                    <div className="bg-card rounded-xl border border-border shadow-sm p-6 flex flex-col items-center space-y-4">
                        <div className="relative group">
                            <Avatar user={user} size="2xl" className="w-32 h-32 text-4xl shadow-md" />
                            <label className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-lg group-hover:scale-105">
                                <Camera className="w-4 h-4" />
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    disabled={uploading}
                                />
                            </label>
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-xl">{user.username}</h3>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-gray-100 text-gray-800'
                                }`}>
                                <Shield className="w-3 h-3 mr-1" />
                                {user.role.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Details Section */}
                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
                        <div className="flex items-center gap-2 pb-4 border-b border-border">
                            <UserIcon className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold text-lg">Account Information</h3>
                        </div>

                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-muted-foreground">Username</label>
                                <div className="p-3 bg-muted/50 rounded-lg border border-border flex items-center gap-3">
                                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                                    <span className="font-medium">{user.username}</span>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                                <div className="p-3 bg-muted/50 rounded-lg border border-border flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-muted-foreground" />
                                    <span className="font-medium">{user.email || 'No email set'}</span>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-muted-foreground">Security</label>
                                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-full text-primary">
                                            <Key className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Password</p>
                                            <p className="text-xs text-muted-foreground">Last changed: Never</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setPwdModalOpen(true)}>
                                        Change Password
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
