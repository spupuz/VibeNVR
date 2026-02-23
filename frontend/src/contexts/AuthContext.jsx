import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('vibe_token'));
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isBackendReady, setIsBackendReady] = useState(false);
    const [healthDetails, setHealthDetails] = useState(null);

    const checkBackendHealth = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const res = await fetch('/api/health', { signal: controller.signal });
            clearTimeout(timeoutId);

            // Try to parse JSON even if status is not 200 (e.g. 503 Service Unavailable)
            const data = await res.json().catch(() => null);
            if (data) {
                // Enrich data with explicit backend status
                setHealthDetails({
                    ...data,
                    components: {
                        ...data.components,
                        backend: 'ok'
                    }
                });
            }

            if (res.ok) {
                setIsBackendReady(true);
                return true;
            }
        } catch (err) {
            // Silence noise in console during startup
            if (err.name === 'AbortError') {
                console.warn("Backend health check timed out after 5s");
            }
            // Provide synthetic error status for GUI visibility
            setHealthDetails({
                status: 'error',
                components: {
                    backend: 'unreachable',
                    database: 'unknown',
                    engine: 'unknown'
                }
            });
        } finally {
            clearTimeout(timeoutId);
        }
        setIsBackendReady(false);
        return false;
    };

    const checkAuth = async () => {
        if (token) {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const userData = await res.json();
                    setUser(userData);
                } else if (res.status === 401) {
                    logout();
                }
            } catch (err) {
                console.error("Auth check failed (network error)", err);
            }
        }
    };

    useEffect(() => {
        const init = async () => {
            const ready = await checkBackendHealth();
            if (ready && token) {
                await checkAuth();
            }
            setLoading(false);
        };

        init();

        // Continuous monitoring: Check health every 10 seconds during the session.
        // If it goes down, isBackendReady will become false and App.jsx will show the init screen.
        const healthInterval = setInterval(async () => {
            const ready = await checkBackendHealth();
            // If it was down and now is ready, and we have a token but no user, try re-auth
            if (ready && token && !user) {
                await checkAuth();
            }
        }, 10000);

        return () => clearInterval(healthInterval);
    }, [token, user]);

    const login = (newToken, userData) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('vibe_token', newToken);
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('vibe_token');
    };

    return (
        <AuthContext.Provider value={{
            token, user, login, logout, checkAuth, loading,
            isBackendReady, healthDetails, checkBackendHealth,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
