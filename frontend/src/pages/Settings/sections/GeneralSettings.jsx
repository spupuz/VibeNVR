import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField } from '../../../components/ui/FormControls';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';

export const GeneralSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    return (
        <CollapsibleSection
            id="general"
            title={t('settings.general_preferences', 'General Preferences')}
            description={t('settings.general_desc', 'Configure global application defaults')}
            icon={<SettingsIcon className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="max-w-xs">
                <SelectField
                    label={t('settings_forms.default_landing', 'Default Landing Page')}
                    value={globalSettings.default_landing_page}
                    onChange={(val) => setGlobalSettings({ ...globalSettings, default_landing_page: val })}
                    help={t('settings_forms.default_landing_help', 'Which page to show first when opening the application')}
                    options={[
                        { value: 'dashboard', label: t('nav.dashboard', 'Dashboard') },
                        { value: 'live', label: t('nav.live', 'Live View') },
                        { value: 'timeline', label: t('nav.timeline', 'Timeline') }
                    ]}
                />

                <SelectField
                    label={t('settings_forms.default_streaming', 'Default Streaming Mode')}
                    value={globalSettings.default_live_view_mode}
                    onChange={(val) => setGlobalSettings({ ...globalSettings, default_live_view_mode: val })}
                    help={t('settings_forms.default_streaming_help', 'Default streaming technology for new cameras')}
                    options={[
                        { value: 'auto', label: t('settings_forms.stream_auto', 'Auto (WebCodecs with Fallback)') },
                        { value: 'webcodecs', label: t('settings_forms.stream_webcodecs', 'Force WebCodecs') },
                        { value: 'mjpeg', label: t('settings_forms.stream_mjpeg', 'Force MJPEG Polling') }
                    ]}
                />
                
                <div className="mt-4">
                    <LanguageSwitcher />
                </div>
            </div>
        </CollapsibleSection>
    );
};
