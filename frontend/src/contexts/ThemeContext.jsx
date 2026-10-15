import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            if (saved === 'dark' || saved === 'light' || saved === 'system') {
                return saved;
            }
        }
        return 'system';
    });

    const [resolvedTheme, setResolvedTheme] = useState(() => {
        if (typeof window === 'undefined') return 'light';
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    const applyTheme = useCallback((currentTheme) => {
        if (typeof window === 'undefined') return;
        const root = window.document.documentElement;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && mediaQuery.matches);
        const resolved = isDark ? 'dark' : 'light';

        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
        setResolvedTheme(resolved);
    }, []);

    const setTheme = useCallback((newTheme) => {
        setThemeState(newTheme);
        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        }
    }, [applyTheme]);

    useEffect(() => {
        applyTheme(theme);

        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleMediaChange = () => {
            if (theme === 'system') {
                applyTheme('system');
            }
        };

        const handleStorageChange = (e) => {
            if (e.key === 'theme' && e.newValue) {
                if (['dark', 'light', 'system'].includes(e.newValue)) {
                    setThemeState(e.newValue);
                    applyTheme(e.newValue);
                }
            }
        };

        mediaQuery.addEventListener('change', handleMediaChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            mediaQuery.removeEventListener('change', handleMediaChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [theme, applyTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, isDark: resolvedTheme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context) return context;

    // Resilient fallback if called outside ThemeProvider
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('theme') || 'system') : 'system';
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (saved === 'system' && prefersDark);

    return {
        theme: saved,
        setTheme: (newTheme) => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('theme', newTheme);
                const root = window.document.documentElement;
                const matchDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const resolved = newTheme === 'dark' || (newTheme === 'system' && matchDark);
                root.classList.remove('light', 'dark');
                root.classList.add(resolved ? 'dark' : 'light');
                window.dispatchEvent(new Event('storage'));
            }
        },
        resolvedTheme: isDark ? 'dark' : 'light',
        isDark
    };
};

