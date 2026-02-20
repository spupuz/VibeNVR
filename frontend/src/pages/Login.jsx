import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [require2FA, setRequire2FA] = useState(false);
    const [error, setError] = useState('');

    // Trusted Device State
    const [trustDevice, setTrustDevice] = useState(false);
    const [deviceName, setDeviceName] = useState(`Browser on ${navigator.platform}`);

    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const checkSetup = async () => {
            try {
                const res = await fetch('/api/auth/status');
                if (res.ok) {
                    const data = await res.json();
                    if (data.setup_required) {
                        navigate('/setup');
                    }
                }
            } catch (err) {
                console.error("Failed to check auth status", err);
            }
        };
        checkSetup();
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            // Send existing device token if available
            const deviceToken = localStorage.getItem('vibe_device_token');
            if (deviceToken) {
                console.log("DEBUG: Sending device token", deviceToken.substring(0, 10) + "...");
                formData.append('device_token', deviceToken);
            } else {
                console.log("DEBUG: No device token found in localStorage");
            }

            if (require2FA) {
                if (useRecoveryCode && recoveryCode) {
                    formData.append('recovery_code', recoveryCode);
                } else if (!useRecoveryCode && totpCode) {
                    formData.append('totp_code', totpCode);
                }

                if (trustDevice) {
                    formData.append('trust_device', 'true');
                    formData.append('device_name', deviceName);
                }
            }

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();

                // Save new device token if received
                if (data.device_token) {
                    console.log("DEBUG: Received new device token", data.device_token.substring(0, 10));
                    localStorage.setItem('vibe_device_token', data.device_token);
                } else {
                    console.log("DEBUG: No device token in response");
                }

                const userRes = await fetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${data.access_token}` }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    login(data.access_token, userData);
                    navigate('/');
                }
            } else {
                const errData = await res.json();
                if (errData.detail === '2FA_REQUIRED') {
                    setRequire2FA(true);
                    setError(''); // Clear previous errors
                    return;
                }
                setError('Invalid username or password');
            }
        } catch (err) {
            setError('Login failed. Please check your connection.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="w-full max-w-md p-6 sm:p-8 space-y-6 bg-white rounded-2xl shadow-2xl">
                {/* Logo */}
                <div className="flex flex-col items-center space-y-4">
                    <img
                        src="/vibe_logo_variant_1.png"
                        alt="VibeNVR"
                        className="h-32 sm:h-40 w-auto"
                    />
                    <div className="text-center">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Welcome Back</h1>
                        <p className="text-gray-500 text-sm sm:text-base mt-1">
                            {require2FA ? 'Enter your 2FA code' : 'Enter your credentials to access VibeNVR'}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!require2FA ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all"
                                        placeholder="admin"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type="password"
                                        className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            {useRecoveryCode ? (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-center block">Recovery Code</label>
                                    <input
                                        type="text"
                                        className="w-full text-center text-xl tracking-wider font-mono py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all"
                                        placeholder="Enter recovery code"
                                        value={recoveryCode}
                                        onChange={(e) => setRecoveryCode(e.target.value)}
                                        autoFocus
                                        required
                                    />
                                    <p className="text-xs text-center text-muted-foreground">
                                        Enter one of your 8-character recovery codes.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-center block">Two-Factor Authenticator Code</label>
                                    <input
                                        type="text"
                                        className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ''))}
                                        autoFocus
                                        required
                                    />
                                    <p className="text-xs text-center text-muted-foreground">
                                        Open your authenticator app and enter the 6-digit code.
                                    </p>
                                </div>
                            )}
                            <div className="flex flex-col space-y-3 pt-2">
                                <div className="flex items-center justify-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="trust-device"
                                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                        checked={trustDevice}
                                        onChange={(e) => setTrustDevice(e.target.checked)}
                                    />
                                    <label htmlFor="trust-device" className="text-sm text-muted-foreground select-none cursor-pointer">
                                        Trust this device (skip 2FA next time)
                                    </label>
                                </div>

                                {trustDevice && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Device Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                            placeholder="e.g. My MacBook"
                                            value={deviceName}
                                            onChange={(e) => setDeviceName(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <div className="space-y-3">
                        <Button className="w-full py-2.5" type="submit">
                            {require2FA ? 'Verify & Login' : 'Sign In'}
                        </Button>

                        {require2FA && (
                            <div className="flex flex-col space-y-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUseRecoveryCode(!useRecoveryCode);
                                        setTotpCode('');
                                        setRecoveryCode('');
                                        setError('');
                                    }}
                                    className="w-full text-sm text-primary hover:text-primary/80 transition-colors"
                                >
                                    {useRecoveryCode ? "Use Authenticator App Instead" : "Lost device? Use Recovery Code"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setRequire2FA(false); setTotpCode(''); setRecoveryCode(''); setError(''); setUseRecoveryCode(false); }}
                                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                                >
                                    Back to Login
                                </button>
                            </div>
                        )}
                    </div>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                    Secure Video Surveillance System
                </p>
            </div>
        </div>
    );
};
