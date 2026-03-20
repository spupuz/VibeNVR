import React from 'react';
import { SectionHeader } from '../../../ui/FormControls';
import { PrivacyMaskManager } from '../../../PrivacyMaskManager';

export const MotionZonesTab = ({ editingId, token, newCamera, setNewCamera }) => {
    return (
        <div className="space-y-6">
            <SectionHeader 
                title="Motion Zones (Exclusion)" 
                description="Define areas to ignore for motion detection" 
            />
            <PrivacyMaskManager 
                cameraId={editingId}
                token={token}
                masks={newCamera.motion_masks}
                onChange={(val) => setNewCamera({ ...newCamera, motion_masks: val })}
                label="Motion Zones"
                description="Draw areas that should be IGNORED by the motion detection engine."
                color="#ef4444"
                hint={`Exclusion zones are invisible in recordings and live view.\nThey only prevent false motion triggers in the specified areas.`}
            />
        </div>
    );
};
