import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField } from '../../../components/ui/FormControls';

export const GeneralSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="general"
            title="General Preferences"
            description="Configure global application defaults"
            icon={<SettingsIcon className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="max-w-xs">
                <SelectField
                    label="Default Landing Page"
                    value={globalSettings.default_landing_page}
                    onChange={(val) => setGlobalSettings({ ...globalSettings, default_landing_page: val })}
                    help="Which page to show first when opening the application"
                    options={[
                        { value: 'dashboard', label: 'Dashboard' },
                        { value: 'live', label: 'Live View' },
                        { value: 'timeline', label: 'Timeline' }
                    ]}
                />

                <SelectField
                    label="Default Streaming Mode"
                    value={globalSettings.default_live_view_mode}
                    onChange={(val) => setGlobalSettings({ ...globalSettings, default_live_view_mode: val })}
                    help="Default streaming technology for new cameras"
                    options={[
                        { value: 'auto', label: 'Auto (WebCodecs with Fallback)' },
                        { value: 'webcodecs', label: 'Force WebCodecs' },
                        { value: 'mjpeg', label: 'Force MJPEG Polling' }
                    ]}
                />
            </div>
        </CollapsibleSection>
    );
};
