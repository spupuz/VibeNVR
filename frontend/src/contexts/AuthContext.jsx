import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('vibe_token'));
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

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
                    // Token invalid/expired - only logout on 401
                    logout();
                } else {
                    console.warn("Auth check failed with status:", res.status);
                    // Do NOT logout for 500s or other errors
                }
            } catch (err) {
                console.error("Auth check failed (network error)", err);
                // Do NOT logout on network error
            }
        } else {
            setLoading(false);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (token) {
            checkAuth();
        } else {
            setLoading(false);
        }
    }, [token]);

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
        <AuthContext.Provider value={{ token, user, login, logout, checkAuth, loading, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
