import React from 'react';
import { SectionHeader } from '../../../ui/FormControls';
import { PrivacyMaskManager } from '../../../PrivacyMaskManager';

export const PrivacyTab = ({ editingId, token, newCamera, setNewCamera }) => {
    return (
        <div className="space-y-6">
            <SectionHeader 
                title="Privacy Masking" 
                description="Obscure sensitive areas of the camera feed" 
            />
            <PrivacyMaskManager 
                cameraId={editingId}
                token={token}
                masks={newCamera.privacy_masks}
                onChange={(val) => setNewCamera({ ...newCamera, privacy_masks: val })}
                label="Privacy Masks"
                description="Draw areas that should be permanently blacked out in recordings."
                color="#000000"
                hint={`Note: Enabling privacy masks will automatically disable Passthrough Recording to ensure the mask is permanently burned into the video.`}
            />
        </div>
    );
};
