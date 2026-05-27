import React from 'react';
import { SectionHeader } from '../../../ui/FormControls';
import { PrivacyMaskManager } from '../../../PrivacyMaskManager';
import { useTranslation } from 'react-i18next';

export const PrivacyTab = ({ editingId, token, newCamera, setNewCamera }) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <SectionHeader 
                title={t('cameras.privacy_masking', 'Privacy Masking')} 
                description={t('cameras.obscure_sensitive_areas_o', 'Obscure sensitive areas of the camera feed')} 
            />
            <PrivacyMaskManager 
                cameraId={editingId}
                token={token}
                masks={newCamera.privacy_masks}
                onChange={(val) => setNewCamera({ ...newCamera, privacy_masks: val })}
                label={t('cameras.privacy_masks', 'Privacy Masks')}
                description={t('cameras.draw_areas_that_should_be', 'Draw areas that should be permanently blacked out in recordings.')}
                color="#000000"
                hint={t('cameras.note_enabling_privacy_mas', `Note: Enabling privacy masks will automatically disable Passthrough Recording to ensure the mask is permanently burned into the video.`)}
            />
        </div>
    );
};
