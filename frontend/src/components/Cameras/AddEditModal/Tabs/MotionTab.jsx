import React from 'react';
import { Copy, Info } from 'lucide-react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../../contexts/ToastContext';

export const MotionTab = ({ newCamera, setNewCamera }) => {
    const { showToast } = useToast();

    return (
        <div className="space-y-6">
            <SectionHeader title="Detection Source" description="How should motion be detected?" />
            <SelectField
                label="Detection Engine"
                value={newCamera.detect_engine || 'OpenCV'}
                onChange={(val) => setNewCamera({ ...newCamera, detect_engine: val })}
                options={[
                    { value: 'OpenCV', label: 'OpenCV (Server Image Analysis)' },
                    ...(newCamera.onvif_can_events ? [{ value: 'ONVIF Edge', label: 'ONVIF Edge (Camera-side Hardware)' }] : [])
                ]}
            />
            {newCamera.detect_engine === 'ONVIF Edge' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p>
                        <strong>Hardware Detection Active:</strong> Sensitivity, threshold, and motion zones are handled by the camera hardware.
                        Local server-side filters and Motion zones are ignored in this mode.
                    </p>
                </div>
            )}

            <SectionHeader title="Detection Schedule" description="When should motion detection be active?" />
            <SelectField
                label="Motion Schedule Mode"
                value={newCamera.detect_motion_mode}
                onChange={(val) => setNewCamera({ ...newCamera, detect_motion_mode: val })}
                options={[
                    { value: 'Always', label: 'Always' },
                    { value: 'Working Schedule', label: 'Working Schedule' },
                    { value: 'Manual Toggle', label: 'Manual Toggle' }
                ]}
            />

            {newCamera.detect_motion_mode === 'Working Schedule' && (
                <div className="bg-muted/30 p-4 rounded-lg border border-border">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Schedule</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const monActive = newCamera.schedule_monday !== false;
                                const monStart = newCamera.schedule_monday_start || "00:00";
                                const monEnd = newCamera.schedule_monday_end || "23:59";

                                const updates = {};
                                ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
                                    updates[`schedule_${day}`] = monActive;
                                    updates[`schedule_${day}_start`] = monStart;
                                    updates[`schedule_${day}_end`] = monEnd;
                                });
                                setNewCamera(prev => ({ ...prev, ...updates }));
                                showToast('Copied Monday settings to all days', 'success');
                            }}
                            className="h-7 text-[10px] px-2 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
                        >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy Mon to All
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                            const key = `schedule_${day.toLowerCase()}`;
                            const keyStart = `${key}_start`;
                            const keyEnd = `${key}_end`;
                            const isActive = newCamera[key] !== false;

                            return (
                                <div key={day} className={`grid grid-cols-12 gap-2 items-center text-sm ${!isActive ? 'opacity-50' : ''}`}>
                                    <div className="col-span-4 flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            checked={isActive}
                                            onChange={(e) => setNewCamera({ ...newCamera, [key]: e.target.checked })}
                                        />
                                        <span className="font-medium w-20">{day}</span>
                                    </div>
                                    <div className="col-span-8 flex items-center space-x-2">
                                        <input
                                            type="time"
                                            className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                            value={newCamera[keyStart] || "00:00"}
                                            onChange={(e) => setNewCamera({ ...newCamera, [keyStart]: e.target.value })}
                                            disabled={!isActive}
                                        />
                                        <span className="text-muted-foreground">-</span>
                                        <input
                                            type="time"
                                            className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                            value={newCamera[keyEnd] || "23:59"}
                                            onChange={(e) => setNewCamera({ ...newCamera, [keyEnd]: e.target.value })}
                                            disabled={!isActive}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {newCamera.detect_engine !== 'ONVIF Edge' && (
                <>
                    <SectionHeader title="Automatic Detection" description="Motion detection tuning options" />
                    <div className="space-y-1">
                        <Slider
                            label="Motion Sensitivity (Threshold)"
                            value={newCamera.threshold || 1500}
                            onChange={(val) => setNewCamera({ ...newCamera, threshold: val })}
                            min={100}
                            max={10000}
                            step={100}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-2">
                            <span>High Sensitivity</span>
                            <span>Low Sensitivity</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                            Controls how many pixels must change to trigger motion. <br />
                            <span className="font-semibold">Lower value (left)</span> = Detects small movements (falling leaves, bugs). <br />
                            <span className="font-semibold">Higher value (right)</span> = Detects only big objects (people, cars).
                        </p>
                    </div>
                    <Toggle
                        label="Despeckle Filter"
                        checked={newCamera.despeckle_filter}
                        onChange={(val) => setNewCamera({ ...newCamera, despeckle_filter: val })}
                    />
                </>
            )}

            <SectionHeader title="Capture Settings" description="Pre/post motion capture options" />
            <InputField
                label="Motion Gap"
                type="number"
                value={newCamera.motion_gap}
                onChange={(val) => setNewCamera({ ...newCamera, motion_gap: val })}
                unit="seconds"
            />
            <div className="grid grid-cols-2 gap-4">
                <InputField
                    label="Captured Before"
                    type="number"
                    value={newCamera.captured_before}
                    onChange={(val) => {
                        // Enforce max 5s limit
                        if (val > 5) val = 5;
                        setNewCamera({ ...newCamera, captured_before: val })
                    }}
                    unit="seconds"
                    max={5}
                    min={0}
                />
                <InputField
                    label="Captured After"
                    type="number"
                    value={newCamera.captured_after}
                    onChange={(val) => setNewCamera({ ...newCamera, captured_after: val })}
                    unit="seconds"
                />
            </div>
            {newCamera.detect_engine !== 'ONVIF Edge' && (
                <InputField
                    label="Minimum Motion Frames"
                    type="number"
                    value={newCamera.min_motion_frames}
                    onChange={(val) => setNewCamera({ ...newCamera, min_motion_frames: val })}
                    unit="frames"
                />
            )}
        </div>
    );
};
