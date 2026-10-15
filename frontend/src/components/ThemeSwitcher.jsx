import React from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from './ui/FormControls';
import { useTheme } from '../contexts/ThemeContext';

export const ThemeSwitcher = ({ className = '', label = null, help = null }) => {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();

    const options = [
        { value: 'light', label: t('theme.light', 'Light') },
        { value: 'dark', label: t('theme.dark', 'Dark') },
        { value: 'system', label: t('theme.system', 'Follow System') }
    ];

    return (
        <div className={className}>
            <SelectField
                label={label}
                value={theme}
                onChange={setTheme}
                help={help}
                options={options}
            />
        </div>
    );
};

