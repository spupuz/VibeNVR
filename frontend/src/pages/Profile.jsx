import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Key, Mail, Shield, Upload, X, User as UserIcon, Smartphone, Check, Copy, Laptop, Trash2, Loader2, Calendar } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatDistanceToNow } from 'date-fns';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export const Profile = () => {
    const { user, token, checkAuth } = useAuth();
    const { showToast } = useToast();
    const [uploading, setUploading] = useState(false);

    // Password Change State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm_password: '' });

    // 2FA State
    const [is2FASetupOpen, setIs2FASetupOpen] = useState(false);
    const [setupData, setSetupData] = useState(null); // { secret, otpauth_url, recovery_codes }
    const [setupCode, setSetupCode] = useState('');
    const [verifying2FA, setVerifying2FA] = useState(false);
    const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [regeneratingCodes, setRegeneratingCodes] = useState(false);

    // Trusted Devices State
    const [trustedDevices, setTrustedDevices] = useState([]);
    const [loadingDevices, setLoadingDevices] = useState(false);

    // Confirm Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        variant: 'danger'
    });

    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    React.useEffect(() => {
        if (user?.is_2fa_enabled) {
            fetchTrustedDevices();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.is_2fa_enabled, token]);

    const fetchTrustedDevices = async () => {
        setLoadingDevices(true);
        try {
            const res = await fetch('/api/auth/devices', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTrustedDevices(data);
            }
        } catch (err) {
            console.error("Failed to fetch devices", err);
        } finally {
            setLoadingDevices(false);
        }
    };

    const handleRevokeDevice = (deviceId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Revoke Device',
            message: 'Are you sure you want to revoke this device? You will need 2FA to login from it again.',
            variant: 'danger',
            onConfirm: () => {
                revokeDevice(deviceId);
                closeConfirmModal();
            }
        });
    };

    const revokeDevice = async (deviceId) => {
        try {
            const res = await fetch(`/api/auth/devices/${deviceId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                showToast('Device revoked successfully', 'success');
                fetchTrustedDevices();

                // Check if we revoked current device
                // We can't easily know strictly by ID without storing it in state from login
                // But we can check if the list is empty? No.
            } else {
                showToast('Failed to revoke device', 'error');
            }
        } catch (err) {
            showToast('Failed to revoke device: ' + err.message, 'error');
        }
    };

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

    const start2FASetup = async () => {
        try {
            const res = await fetch('/api/auth/2fa/setup', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSetupData(data);
                setIs2FASetupOpen(true);
            } else {
                showToast('Failed to initialize 2FA setup', 'error');
            }
        } catch (err) {
            showToast('Failed to initialize 2FA setup: ' + err.message, 'error');
        }
    };

    const verifyAndEnable2FA = async () => {
        if (!setupCode || setupCode.length !== 6) {
            showToast('Please enter a valid 6-digit code', 'error');
            return;
        }
        setVerifying2FA(true);
        try {
            const res = await fetch('/api/auth/2fa/enable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ code: setupCode })
            });

            if (res.ok) {
                showToast('2FA Enabled Successfully! Please save your recovery codes.', 'success');
                setRecoveryCodes(setupData.recovery_codes || []);
                setShowRecoveryCodes(true);
                setSetupData(null);
                setSetupCode('');
                // Note: user state (checkAuth) will be refreshed when the user closes the modal
            } else {
                const err = await res.json();
                showToast('Verification failed: ' + err.detail, 'error');
            }
        } catch (err) {
            showToast('Verification failed: ' + err.message, 'error');
        } finally {
            setVerifying2FA(false);
        }
    };

    const handleDisable2FA = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Disable 2FA',
            message: 'Are you sure you want to disable 2FA? This will make your account less secure.',
            variant: 'danger',
            onConfirm: () => {
                disable2FA();
                closeConfirmModal();
            }
        });
    };

    const disable2FA = async () => {
        try {
            const res = await fetch('/api/auth/2fa/disable', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                showToast('2FA Disabled', 'success');
                await checkAuth(); // Refresh user state
            } else {
                showToast('Failed to disable 2FA', 'error');
            }
        } catch (err) {
            showToast('Failed to disable 2FA: ' + err.message, 'error');
        }
    };

    const handleRegenerateCodes = async () => {
        setConfirmModal({
            isOpen: true,
            title: 'Regenerate Recovery Codes',
            message: 'Are you sure you want to regenerate your recovery codes? Your old codes will immediately stop working.',
            variant: 'danger',
            onConfirm: async () => {
                closeConfirmModal();
                setRegeneratingCodes(true);
                try {
                    const res = await fetch('/api/auth/2fa/recovery-codes', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setRecoveryCodes(data.recovery_codes);
                        setShowRecoveryCodes(true);
                        showToast('Recovery codes regenerated successfully', 'success');
                    } else {
                        showToast('Failed to regenerate recovery codes', 'error');
                    }
                } catch (err) {
                    showToast('Error regenerating codes: ' + err.message, 'error');
                } finally {
                    setRegeneratingCodes(false);
                }
            }
        });
    };

    const handleDownloadCodes = () => {
        const text = `VibeNVR 2FA Recovery Codes\nGenerated: ${new Date().toLocaleString()}\n\n` +
            recoveryCodes.join('   ') +
            `\n\nKeep these safe! Each code can only be used once.`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vibenvr-recovery-codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Password Modal */}
            {pwdModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl p-6 space-y-4">
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

            {/* 2FA Setup Modal */}
            {is2FASetupOpen && setupData && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-sm rounded-2xl border border-border shadow-2xl p-6 space-y-6">
                        <div className="flex justify-between items-center border-b border-border pb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Smartphone className="w-5 h-5 text-primary" />
                                Setup 2FA
                            </h3>
                            <button onClick={() => { setIs2FASetupOpen(false); setSetupCode(''); }} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-lg flex justify-center border border-gray-200">
                                <QRCodeSVG value={setupData.otpauth_url} size={200} />
                            </div>

                            <div className="text-center space-y-2">
                                <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                                <div className="text-xs font-mono bg-muted p-2 rounded border border-border break-all select-all flex items-center justify-center gap-2">
                                    {setupData.secret}
                                    <button onClick={() => navigator.clipboard.writeText(setupData.secret)} className="hover:text-primary" title="Copy Secret">
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="text-sm font-medium mb-1 block">Enter 6-digit Code</label>
                                <input
                                    type="text"
                                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-center text-xl tracking-widest font-mono focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    required
                                    placeholder="000 000"
                                    maxLength={6}
                                    value={setupCode}
                                    onChange={e => setSetupCode(e.target.value.replace(/[^0-9]/g, ''))}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-border">
                            <Button variant="outline" onClick={() => { setIs2FASetupOpen(false); setSetupCode(''); }}>Cancel</Button>
                            <Button onClick={verifyAndEnable2FA} disabled={verifying2FA}>
                                {verifying2FA ? 'Verifying...' : 'Enable 2FA'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recovery Codes Modal */}
            {showRecoveryCodes && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl p-6 space-y-6">
                        <div className="border-b border-border pb-4">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                                <Shield className="w-6 h-6" />
                                Save Your Recovery Codes
                            </h3>
                            <p className="text-sm text-muted-foreground mt-2">
                                If you lose access to your authenticator app, you can use these backup codes to sign in.
                                <strong> Each code can only be used once.</strong>
                            </p>
                        </div>

                        <div className="bg-muted p-4 rounded-lg border border-border">
                            <div className="grid grid-cols-2 gap-4 font-mono text-sm tracking-wider">
                                {recoveryCodes.map((code, idx) => (
                                    <div key={idx} className="bg-background px-3 py-2 rounded text-center border shadow-sm">
                                        {code}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border">
                            <Button variant="outline" onClick={handleDownloadCodes} className="flex gap-2">
                                Download as TXT
                            </Button>
                            <Button onClick={async () => {
                                setShowRecoveryCodes(false);
                                setIs2FASetupOpen(false);
                                await checkAuth();
                            }}>
                                I Have Saved Them
                            </Button>
                        </div>
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

                                {/* Password Row */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/30 rounded-lg border border-border gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-full text-primary shrink-0">
                                            <Key className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Password</p>
                                            <p className="text-xs text-muted-foreground">Secure your account</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setPwdModalOpen(true)} className="w-full sm:w-auto">
                                        Change Password
                                    </Button>
                                </div>

                                {/* 2FA Row */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/30 rounded-lg border border-border mt-2 gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full shrink-0 ${user.is_2fa_enabled ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-orange-100 text-orange-600 dark:bg-orange-900/30'}`}>
                                            <Smartphone className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-medium">Two-Factor Authentication</p>
                                                {user.is_2fa_enabled && (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold border border-green-200">ENABLED</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {user.is_2fa_enabled
                                                    ? 'Your account is secured with 2FA.'
                                                    : 'Add an extra layer of security.'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-3 sm:mt-0">
                                        {user.is_2fa_enabled ? (
                                            <>
                                                <Button variant="outline" size="sm" onClick={handleRegenerateCodes} disabled={regeneratingCodes} className="w-full sm:w-auto">
                                                    Regenerate Codes
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={handleDisable2FA} className="w-full sm:w-auto text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900">
                                                    Disable 2FA
                                                </Button>
                                            </>
                                        ) : (
                                            <Button variant="outline" size="sm" onClick={start2FASetup} className="w-full sm:w-auto">
                                                Enable 2FA
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Trusted Devices List */}
                                {user.is_2fa_enabled && (
                                    <div className="pt-4 border-t border-border mt-4">
                                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                            <Laptop className="w-4 h-4 text-primary" />
                                            Trusted Devices
                                        </h4>

                                        {loadingDevices ? (
                                            <p className="text-sm text-muted-foreground">Loading devices...</p>
                                        ) : trustedDevices.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">No trusted devices found.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {trustedDevices.map(device => (
                                                    <div key={device.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border text-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-muted rounded-full">
                                                                <Laptop className="w-4 h-4 text-muted-foreground" />
                                                            </div>
                                                            <div>
                                                                <p className="font-medium">{device.name || 'Unknown Device'}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Last used {formatDistanceToNow(new Date(device.last_used))} ago
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRevokeDevice(device.id)}
                                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors"
                                                            title="Revoke Device"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                variant={confirmModal.variant}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirmModal}
            />
        </div>
    );
};
