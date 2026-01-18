import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Lock, Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const Setup = () => {
    const [username, setUsername] = useState('admin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch('http://' + window.location.hostname + ':5000/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            if (res.ok) {
                // Determine logic: Setup creates user, but we need to login to get token.
                // Or does setup return the user? Yes.
                // We should auto-login or redirect to login.
                // Let's redirect to login for security/simplicity.
                // Or better: auto login.
                // Let's perform a login immediately after setup.
                const loginFormData = new FormData();
                loginFormData.append('username', username);
                loginFormData.append('password', password);

                const loginRes = await fetch('http://' + window.location.hostname + ':5000/auth/login', {
                    method: 'POST',
                    body: loginFormData,
                });

                if (loginRes.ok) {
                    const data = await loginRes.json();
                    const userRes = await fetch('http://' + window.location.hostname + ':5000/auth/me', {
                        headers: { Authorization: `Bearer ${data.access_token}` }
                    });
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        login(data.access_token, userData);
                        navigate('/');
                    }
                } else {
                    navigate('/login');
                }
            } else {
                const errData = await res.json();
                setError(errData.detail || 'Setup failed');
            }
        } catch (err) {
            setError('Setup failed. Please check your connection.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-lg p-8 space-y-8 bg-card rounded-xl border border-border shadow-lg">
                <div className="space-y-4 text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter">System Setup</h1>
                    <p className="text-muted-foreground">Create your Administrator account to secure VibeNVR</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <input
                                type="email"
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
                                placeholder="admin@vibenvr.local"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
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
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <Button className="w-full" size="lg" type="submit">
                        Create Administrator
                    </Button>
                </form>
            </div>
        </div>
    );
};
