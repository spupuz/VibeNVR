import React from 'react';
import { Monitor } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField } from '../../../components/ui/FormControls';

export const LiveViewLayoutSettings = ({
    liveViewColumns,
    setLiveViewColumns,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="liveview"
            title="Live View Layout"
            description="Customize how cameras are displayed"
            icon={<Monitor className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-4">
                <SelectField
                    label="Grid Columns"
                    value={liveViewColumns}
                    onChange={(val) => setLiveViewColumns(val)}
                    className="max-w-full sm:max-w-xs"
                    help="Choose how many columns to display in the Live View grid"
                    options={[
                        { value: 'auto', label: 'Auto (Based on camera count)' },
                        { value: '1', label: '1 Column' },
                        { value: '2', label: '2 Columns' },
                        { value: '3', label: '3 Columns' },
                        { value: '4', label: '4 Columns' }
                    ]}
                />
            </div>
        </CollapsibleSection>
    );
};
