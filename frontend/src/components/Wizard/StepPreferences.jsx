import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { Globe, Sun, Moon, Monitor, LayoutDashboard, Film, History } from 'lucide-react';

const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Português' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'pl', label: 'Polski' },
    { code: 'ru', label: 'Русский' },
    { code: 'zh', label: '中文' },
];

export const StepPreferences = ({ prefs, setPrefs }) => {
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();

    const handleLanguageChange = (lang) => {
        i18n.changeLanguage(lang);
        setPrefs(prev => ({ ...prev, language: lang }));
    };

    const themes = [
        { id: 'light', label: t('theme.light', 'Light'), icon: Sun },
        { id: 'dark', label: t('theme.dark', 'Dark'), icon: Moon },
        { id: 'system', label: t('theme.system', 'System'), icon: Monitor },
    ];

    const landings = [
        { id: 'live', label: t('nav.live', 'Live View'), icon: Film },
        { id: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutDashboard },
        { id: 'timeline', label: t('nav.timeline', 'Timeline'), icon: History },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-1">{t('wizard.prefs.title', 'Preferences & Appearance')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('wizard.prefs.subtitle', 'Customize language, theme, and your default landing page.')}
                </p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    {t('wizard.prefs.language', 'Language')}
                </label>
                <select
                    value={i18n.language?.split('-')[0] || 'en'}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium block">{t('wizard.prefs.theme', 'Theme')}</label>
                <div className="grid grid-cols-3 gap-3">
                    {themes.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTheme(id)}
                            className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                                theme === id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-accent text-muted-foreground'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium block">
                    {t('wizard.prefs.landing', 'Default Landing Page')}
                </label>
                <div className="grid grid-cols-3 gap-3">
                    {landings.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setPrefs(prev => ({ ...prev, default_landing_page: id }))}
                            className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                                prefs.default_landing_page === id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-accent text-muted-foreground'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium block">
                    {t('wizard.prefs.live_columns', 'Live View Grid Columns')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                    {['auto', '2', '3', '4'].map((cols) => (
                        <button
                            key={cols}
                            type="button"
                            onClick={() => {
                                localStorage.setItem('liveViewColumns', cols);
                                setPrefs(prev => ({ ...prev, liveViewColumns: cols }));
                            }}
                            className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${
                                (prefs.liveViewColumns || 'auto') === cols
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-accent text-muted-foreground'
                            }`}
                        >
                            {cols === 'auto' ? t('common.auto', 'Auto') : `${cols} ${t('wizard.prefs.cols', 'Cols')}`}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
