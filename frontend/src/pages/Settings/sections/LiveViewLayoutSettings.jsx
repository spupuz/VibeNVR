import React from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField } from '../../../components/ui/FormControls';

export const LiveViewLayoutSettings = ({
    liveViewColumns,
    setLiveViewColumns,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    return (
        <CollapsibleSection
            id="liveview"
            title={t('settings_liveviewlayoutsettings.title', 'Live View Layout')}
            description={t('settings_liveviewlayoutsettings.subtitle', 'Customize how cameras are displayed')}
            icon={<Monitor className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-4">
                <SelectField
                    label={t('settings_liveviewlayoutsettings.grid_columns', 'Grid Columns')}
                    value={liveViewColumns}
                    onChange={(val) => setLiveViewColumns(val)}
                    className="max-w-full sm:max-w-xs"
                    help={t('settings_liveviewlayoutsettings.grid_columns_help', 'Choose how many columns to display in the Live View grid')}
                    options={[
                        { value: 'auto', label: t('settings_liveviewlayoutsettings.auto_based_on_camera_count', 'Auto (Based on camera count)') },
                        { value: '1', label: t('settings_liveviewlayoutsettings.1_column', '1 Column') },
                        { value: '2', label: t('settings_liveviewlayoutsettings.2_columns', '2 Columns') },
                        { value: '3', label: t('settings_liveviewlayoutsettings.3_columns', '3 Columns') },
                        { value: '4', label: t('settings_liveviewlayoutsettings.4_columns', '4 Columns') }
                    ]}
                />
            </div>
        </CollapsibleSection>
    );
};
