import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const checkSetup = async () => {
            try {
                const res = await fetch('http://localhost:5000/auth/status');
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

            const res = await fetch('http://localhost:5000/auth/login', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                const userRes = await fetch('http://localhost:5000/auth/me', {
                    headers: { Authorization: `Bearer ${data.access_token}` }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    login(data.access_token, userData);
                    navigate('/');
                }
            } else {
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
                            Enter your credentials to access VibeNVR
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
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

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <Button className="w-full py-2.5" type="submit">
                        Sign In
                    </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                    Secure Video Surveillance System
                </p>
            </div>
        </div>
    );
};
