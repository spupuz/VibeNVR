import React from 'react';
import { Copy, Info } from 'lucide-react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../../contexts/ToastContext';
import { useTranslation } from 'react-i18next';

export const MotionTab = ({ newCamera, setNewCamera, setActiveTab, globalSettings }) => {
  const { t } = useTranslation();
    const { showToast } = useToast();
    const isAiEnabledGlobally = globalSettings?.ai_enabled?.value === 'true' || globalSettings?.ai_enabled === true || globalSettings?.ai_enabled === "true";
    const isAiDisabledGlobally = !isAiEnabledGlobally;

    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.detection_source', 'Detection Source')} description={t('cameras.how_should_motion_be_de', 'How should motion be detected?')} />
            <SelectField
                label={t('cameras.detection_engine', 'Detection Engine')}
                value={newCamera.detect_engine || 'OpenCV'}
                onChange={(val) => setNewCamera({ ...newCamera, detect_engine: val })}
                options={[
                    { value: 'OpenCV', label: t('cameras.opencv_server_image_ana', 'OpenCV (Server Image Analysis)') },
                    { 
                        value: 'AI', 
                        label: t('cameras.ai_object_detection_tpu_cpu', 'AI (Object Detection - TPU/CPU)') + (isAiDisabledGlobally ? ` ${t('cameras.disabled_globally_label', '(DISABLED GLOBALLY)')}` : ''),
                        disabled: isAiDisabledGlobally 
                    },
                    ...(newCamera.onvif_host && newCamera.onvif_can_events ? [{ value: 'ONVIF Edge', label: t('cameras.onvif_edge_camera_side', 'ONVIF Edge (Camera-side Hardware)') }] : [])
                ]}
            />
            {isAiDisabledGlobally && newCamera.detect_engine === 'AI' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">{t('cameras.ai_detection_unavailable', 'AI Detection Unavailable')}</p>
                        <p className="mt-1">
                            AI is currently <strong>{t('cameras.disabled_globally', 'disabled globally')}</strong> in system settings. 
                            This camera will use <strong>{t('cameras.opencv', 'OpenCV')}</strong> as a fallback until AI is re-enabled.
                        </p>
                    </div>
                </div>
            )}
            {newCamera.detect_engine === 'AI' && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[11px] text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">{t('cameras.ai_only_detection_active', 'AI-Only Detection Active')}</p>
                        <p className="mt-1">
                            The system will only trigger recordings when specific objects are identified. 
                            <strong> {t('cameras.configure_which_objects_p', 'Configure which objects (Person, Vehicle, Dog, etc.) trigger the motion in the')} <span className="text-blue-700 dark:text-blue-300 underline cursor-pointer" onClick={() => setActiveTab('ai')}>{t('cameras.ai_tracking', 'AI & Tracking')}</span> tab.</strong>
                        </p>
                        <p className="mt-1 opacity-70 italic">{t('cameras.standard_motion_filters_t', 'Standard motion filters (threshold/sensitivity) are ignored in this mode.')}</p>
                    </div>
                </div>
            )}

            {newCamera.detect_engine === 'ONVIF Edge' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p>
                        <strong>{t('cameras.hardware_detection_active', 'Hardware Detection Active:')}</strong> {t('cameras.sensitivity_threshold_a', 'Sensitivity, threshold, and motion zones are handled by the camera hardware.')}
                        {t('cameras.local_server_side_filte', 'Local server-side filters and Motion zones are ignored in this mode.')}
                    </p>
                </div>
            )}

            <SectionHeader title={t('cameras.detection_schedule', 'Detection Schedule')} description={t('cameras.when_should_motion_dete', 'When should motion detection be active?')} />
            <SelectField
                label={t('cameras.motion_schedule_mode', 'Motion Schedule Mode')}
                value={newCamera.detect_motion_mode}
                onChange={(val) => setNewCamera({ ...newCamera, detect_motion_mode: val })}
                options={[
                    { value: 'Always', label: t('cameras.always', 'Always') },
                    { value: 'Working Schedule', label: t('cameras.working_schedule', 'Working Schedule') },
                    { value: 'Manual Toggle', label: t('cameras.manual_toggle', 'Manual Toggle') }
                ]}
            />

            {newCamera.detect_motion_mode === 'Working Schedule' && (
                <div className="bg-muted/30 p-4 rounded-lg border border-border">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('cameras.weekly_schedule', 'Weekly Schedule')}</p>
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
                                showToast(t('cameras.copied_monday_settings', 'Copied Monday settings to all days'), 'success');
                            }}
                            className="h-7 text-[10px] px-2 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
                        >
                            <Copy className="w-3 h-3 mr-1" />
                            {t('cameras.copy_mon_to_all', 'Copy Mon to All')}
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
                                        <span className="font-medium w-20">{t(`cameras.day_${day.toLowerCase()}`, day)}</span>
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

            {(newCamera.detect_engine === 'OpenCV' || (newCamera.detect_engine === 'AI' && isAiDisabledGlobally)) && (
                <>
                    <SectionHeader title={t('cameras.automatic_detection', 'Automatic Detection')} description={t('cameras.motion_detection_tuning', 'Motion detection tuning options')} />
                    <div className="space-y-1">
                        <Slider
                            label={t('cameras.motion_sensitivity_thre', 'Motion Sensitivity (Threshold)')}
                            value={newCamera.threshold || 1500}
                            onChange={(val) => setNewCamera({ ...newCamera, threshold: val })}
                            min={100}
                            max={10000}
                            step={100}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-2">
                            <span>{t('cameras.high_sensitivity', 'High Sensitivity')}</span>
                            <span>{t('cameras.low_sensitivity', 'Low Sensitivity')}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1">
                            Controls how many pixels must change to trigger motion. <br />
                            <span className="font-semibold">{t('cameras.lower_value_left', 'Lower value (left)')}</span> {t('cameras.detects_small_movements', '= Detects small movements (falling leaves, bugs).')} <br />
                            <span className="font-semibold">{t('cameras.higher_value_right', 'Higher value (right)')}</span> {t('cameras.detects_only_big_objects', '= Detects only big objects (people, cars).')}
                        </p>
                    </div>
                    <Toggle
                        label={t('cameras.despeckle_filter', 'Despeckle Filter')}
                        checked={newCamera.despeckle_filter}
                        onChange={(val) => setNewCamera({ ...newCamera, despeckle_filter: val })}
                    />
                </>
            )}

            <SectionHeader title={t('cameras.capture_settings', 'Capture Settings')} description={t('cameras.pre_post_motion_capture', 'Pre/post motion capture options')} />
            <InputField
                label={t('cameras.motion_gap', 'Motion Gap')}
                type="number"
                value={newCamera.motion_gap}
                onChange={(val) => setNewCamera({ ...newCamera, motion_gap: val })}
                unit="seconds"
            />
            <div className="grid grid-cols-2 gap-4">
                <InputField
                    label={t('cameras.captured_before', 'Captured Before')}
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
                    label={t('cameras.captured_after', 'Captured After')}
                    type="number"
                    value={newCamera.captured_after}
                    onChange={(val) => setNewCamera({ ...newCamera, captured_after: val })}
                    unit="seconds"
                />
            </div>
            {(newCamera.detect_engine === 'OpenCV' || (newCamera.detect_engine === 'AI' && isAiDisabledGlobally)) && (
                <InputField
                    label={t('cameras.minimum_motion_frames', 'Minimum Motion Frames')}
                    type="number"
                    value={newCamera.min_motion_frames}
                    onChange={(val) => setNewCamera({ ...newCamera, min_motion_frames: val })}
                    unit="frames"
                />
            )}
        </div>
    );
};
