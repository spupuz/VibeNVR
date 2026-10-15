import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, ChevronUp, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export const ThemeDropWindow = ({ className = '' }) => {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div className={`relative w-full ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                title={t('theme.theme', 'Theme')}
                aria-label={t('theme.theme', 'Theme')}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
                <div className="flex items-center space-x-3 truncate">
                    {theme === 'dark' ? (
                        <Moon className="w-5 h-5 transition-transform group-hover:scale-110 shrink-0" />
                    ) : theme === 'light' ? (
                        <Sun className="w-5 h-5 transition-transform group-hover:scale-110 shrink-0" />
                    ) : (
                        <Monitor className="w-5 h-5 transition-transform group-hover:scale-110 shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate">
                        {theme === 'dark'
                            ? t('theme.dark_mode', 'Dark Mode')
                            : theme === 'light'
                                ? t('theme.light_mode', 'Light Mode')
                                : t('theme.system_mode', 'Follow System')}
                    </span>
                </div>
                <ChevronUp className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${open ? '' : 'rotate-180'}`} />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={t('theme.theme', 'Theme')}
                    className="absolute bottom-full left-0 right-0 mb-1.5 bg-card border border-border rounded-xl shadow-xl p-1.5 z-50 space-y-1"
                >
                    <button
                        type="button"
                        role="option"
                        aria-selected={theme === 'light'}
                        onClick={() => {
                            setTheme('light');
                            setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            theme === 'light'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                    >
                        <div className="flex items-center space-x-2.5">
                            <Sun className="w-4 h-4" />
                            <span>{t('theme.light_mode', 'Light Mode')}</span>
                        </div>
                        {theme === 'light' && <Check className="w-4 h-4" />}
                    </button>

                    <button
                        type="button"
                        role="option"
                        aria-selected={theme === 'dark'}
                        onClick={() => {
                            setTheme('dark');
                            setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            theme === 'dark'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                    >
                        <div className="flex items-center space-x-2.5">
                            <Moon className="w-4 h-4" />
                            <span>{t('theme.dark_mode', 'Dark Mode')}</span>
                        </div>
                        {theme === 'dark' && <Check className="w-4 h-4" />}
                    </button>

                    <button
                        type="button"
                        role="option"
                        aria-selected={theme === 'system'}
                        onClick={() => {
                            setTheme('system');
                            setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            theme === 'system'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                    >
                        <div className="flex items-center space-x-2.5">
                            <Monitor className="w-4 h-4" />
                            <span>{t('theme.system_mode', 'Follow System')}</span>
                        </div>
                        {theme === 'system' && <Check className="w-4 h-4" />}
                    </button>
                </div>
            )}
        </div>
    );
};

