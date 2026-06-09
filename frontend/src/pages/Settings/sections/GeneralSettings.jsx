import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField, Toggle } from '../../../components/ui/FormControls';
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
            <div className="max-w-md space-y-4">
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
                
                <div className="pt-2 border-t border-border/50">
                    <Toggle
                        label={t('settings_go2rtc.activation', 'Use go2rtc Gateway')}
                        help={t('settings_go2rtc.activation_help', 'Route all cameras through the internal go2rtc gateway instead of connecting directly. Improves stability with flaky/cheap IP cameras (broken streams, slow handshakes, session limits) and lowers CPU. Toggling this restarts all camera streams.')}
                        checked={globalSettings.go2rtc_enabled === true || globalSettings.go2rtc_enabled === "true"}
                        onChange={(val) => setGlobalSettings({ ...globalSettings, go2rtc_enabled: val })}
                    />
                </div>

                <div className="mt-4">
                    <LanguageSwitcher />
                </div>
            </div>
        </CollapsibleSection>
    );
};
