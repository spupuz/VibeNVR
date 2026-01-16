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
                // Login successful, fetch user data
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
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg">
                <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold tracking-tighter">Welcome Back</h1>
                    <p className="text-muted-foreground">Enter your credentials to access VibeNVR</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
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
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <Button className="w-full" type="submit">
                        Sign In
                    </Button>
                </form>
            </div>
        </div>
    );
};
