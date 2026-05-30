import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from './ui/FormControls';
import { useAuth } from '../contexts/AuthContext';

export const LanguageSwitcher = ({ className = '' }) => {
    const { i18n, t } = useTranslation();
    const { user, token, checkAuth } = useAuth();

    const options = [
        { value: 'en', label: 'English' },
        { value: 'it', label: 'Italiano' },
        { value: 'fr', label: 'Français' },
        { value: 'de', label: 'Deutsch' },
        { value: 'es', label: 'Español' },
        { value: 'ru', label: 'Русский' },
        { value: 'uk', label: 'Українська' },
        { value: 'zh', label: '中文 (Simplified)' },
        { value: 'pt', label: 'Português' },
        { value: 'ja', label: '日本語' }
    ];

    const handleLanguageChange = async (lang) => {
        i18n.changeLanguage(lang);
        if (user && token) {
            try {
                await fetch('/api/auth/me/language', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ language: lang })
                });
                // Optionally update the user context by calling checkAuth or updating user state manually
                if (checkAuth) {
                   await checkAuth();
                }
            } catch (err) {
                console.error('Failed to save language preference', err);
            }
        } else {
            // If not logged in, remember that they explicitly chose a language
            sessionStorage.setItem('explicit_language_selection', lang);
        }
    };

    // Sync initial language if user is logged in and has preference
    useEffect(() => {
        if (user?.language && user.language !== i18n.language.split('-')[0]) {
            i18n.changeLanguage(user.language);
        }
    }, [user?.language, i18n]);

    return (
        <SelectField
            label={t('common.language', 'Language')}
            value={i18n.language.split('-')[0] || 'en'}
            onChange={handleLanguageChange}
            options={options}
            className={className}
        />
    );
};