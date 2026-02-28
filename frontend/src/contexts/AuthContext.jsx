import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Token lives in memory ONLY — never in localStorage.
    // Persistence across page reloads is handled by the HttpOnly auth_token cookie (set by backend on login).
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isBackendReady, setIsBackendReady] = useState(false);
    const [healthDetails, setHealthDetails] = useState(null);

    const checkBackendHealth = React.useCallback(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const res = await fetch('/api/health', { signal: controller.signal });
            clearTimeout(timeoutId);

            const data = await res.json().catch(() => null);
            if (data) {
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
            if (err.name === 'AbortError') {
                console.warn("Backend health check timed out after 5s");
            }
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
    }, []);

    /**
     * Restore session from HttpOnly cookie on page load/reload.
     * JS never reads the cookie — the backend reads it server-side and returns
     * the user data + access_token (so we can put it in memory for Bearer headers).
     */
    const bootstrapFromCookie = React.useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me-from-cookie', {
                credentials: 'include'
            });
            if (res.ok) {
                const { user: userData, access_token } = await res.json();
                setUser(userData);
                setToken(access_token);
            }
            // 401 = no valid cookie, user needs to log in — that's expected, no error
        } catch (err) {
            console.error("Cookie bootstrap failed", err);
        }
    }, []);

    const checkAuth = React.useCallback(async () => {
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
    }, [token]);

    useEffect(() => {
        const init = async () => {
            const ready = await checkBackendHealth();
            if (ready) {
                // Restore session from HttpOnly cookie (transparent to user on page reload)
                await bootstrapFromCookie();
            }
            setLoading(false);
        };

        init();

        const healthInterval = setInterval(async () => {
            const ready = await checkBackendHealth();
            if (ready && token && !user) {
                await checkAuth();
            }
        }, 10000);

        return () => clearInterval(healthInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = (newToken, userData) => {
        // Token stored in memory only — HttpOnly cookie already set by backend on login response
        setToken(newToken);
        setUser(userData);
    };

    const logout = async () => {
        setToken(null);
        setUser(null);
        // Clear HttpOnly cookies server-side — JS cannot delete httpOnly cookies directly
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (err) {
            console.error("Logout cookie clear failed", err);
        }
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
