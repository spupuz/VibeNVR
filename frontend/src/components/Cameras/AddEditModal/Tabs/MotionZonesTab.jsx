import React from 'react';
import { Info } from 'lucide-react';
import { SectionHeader } from '../../../ui/FormControls';
import { PrivacyMaskManager } from '../../../PrivacyMaskManager';

export const MotionZonesTab = ({ editingId, token, newCamera, setNewCamera }) => {
    return (
        <div className="space-y-6">
            <SectionHeader 
                title="Motion Zones (Exclusion)" 
                description="Define areas to ignore for motion detection" 
            />

            {newCamera.detect_engine === 'ONVIF Edge' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-3 mb-4">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold mb-1">Incompatible with ONVIF Edge</p>
                        <p className="opacity-90 leading-relaxed">
                            Since you are using <strong>ONVIF Edge</strong> detection, the camera's hardware is responsible for all motion analysis. 
                            Local exclusion zones defined here are ignored because the server-side analyzer is bypassed.
                        </p>
                    </div>
                </div>
            )}

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
