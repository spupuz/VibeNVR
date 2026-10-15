import React from 'react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { useTranslation } from 'react-i18next';

export const MoviesTab = ({ newCamera, setNewCamera }) => {
  const { t } = useTranslation();
    const hasPrivacyMasks = (() => {
        try {
            const masks = typeof newCamera.privacy_masks === 'string'
                ? JSON.parse(newCamera.privacy_masks)
                : newCamera.privacy_masks;
            return Array.isArray(masks) && masks.length > 0;
        } catch (e) {
            return false;
        }
    })();

    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.recording_settings', 'Recording Settings')} description={t('cameras.configure_video_recording', 'Configure video recording options')} />
            <SelectField
                label={t('cameras.recording_mode', 'Recording Mode')}
                value={newCamera.recording_mode}
                onChange={(val) => setNewCamera({ ...newCamera, recording_mode: val })}
                options={[
                    { value: 'Motion Triggered', label: t('cameras.motion_triggered', 'Motion Triggered') },
                    { value: 'Continuous', label: t('cameras.continuous', 'Continuous') },
                    { value: 'Off', label: t('cameras.off', 'Off') }
                ]}
            />
            <Toggle
                label={t('cameras.record_audio', 'Record Audio')}
                checked={!!newCamera.record_audio}
                onChange={(val) => setNewCamera({ ...newCamera, record_audio: val })}
                help={t('cameras.saves_the_audio_stream_al', 'Saves the audio stream along with the video. Available in both Passthrough and Transcoding modes.')}
            />
            <div className={`p-3 rounded-lg text-xs mb-4 transition-all duration-300 ${
                hasPrivacyMasks 
                    ? 'bg-muted/50 border border-border opacity-80' 
                    : 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/50'
            }`}>
                <Toggle
                    label={t('cameras.passthrough_recording_cpu', 'Passthrough Recording (CPU Saver)')}
                    checked={hasPrivacyMasks ? false : !!newCamera.movie_passthrough}
                    onChange={(val) => {
                        setNewCamera(prev => ({ 
                            ...prev, 
                            movie_passthrough: val,
                            // Automatically downgrade AI to OpenCV if passthrough is disabled
                            detect_engine: (!val && prev.detect_engine === 'AI') ? 'OpenCV' : prev.detect_engine 
                        }));
                    }}
                    disabled={hasPrivacyMasks}
                />
                <p className="mt-1 text-muted-foreground ml-1">
                    {hasPrivacyMasks ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 mt-2">
                             {t('cameras.privacy_masks_active_reencode', 'Privacy Masks Active: The NVR must re-encode the video to permanently burn the masks into recordings. Passthrough is disabled.')}
                        </span>
                    ) : (
                        <>
                            {t('cameras.directly_saves_the_video_', 'Directly saves the video stream without re-encoding.')} <br />
                            <span className="font-semibold text-green-600 dark:text-green-400">{t('cameras.pros', 'Pros:')}</span> {t('cameras.near_zero_cpu', 'Near-zero CPU usage, original quality.')} <br />
                            <span className="font-semibold text-red-600 dark:text-red-400">{t('cameras.cons', 'Cons:')}</span> {t('cameras.no_text_overlays', 'No Text Overlays, potential start delay, MP4 container only.')}
                        </>
                    )}
                </p>
            </div>
            <Slider
                label={t('cameras.movie_quality', 'Movie Quality')}
                value={newCamera.movie_quality}
                onChange={(val) => setNewCamera({ ...newCamera, movie_quality: val })}
                min={10}
                max={100}
                step={5}
                unit="%"
                marks={['10%', '25%', '50%', '75%', '100%']}
            />
            <Slider
                label={t('cameras.maximum_movie_length', 'Maximum Movie Length')}
                value={newCamera.max_movie_length || 300}
                onChange={(val) => setNewCamera({ ...newCamera, max_movie_length: val })}
                min={60}
                max={300}
                step={30}
                unit=" sec"
                marks={['1m', '2m', '3m', '4m', '5m']}
                help={t('cameras.recording_segments_will_b', 'Recording segments will be split at this length')}
            />
            <SectionHeader title={t('cameras.file_naming', 'File Naming')} />
            <InputField
                label={t('cameras.movie_file_name', 'Movie File Name')}
                value={newCamera.movie_file_name}
                onChange={(val) => setNewCamera({ ...newCamera, movie_file_name: val })}
                placeholder="%Y-%m-%d/%H-%M-%S"
            />
        </div>
    );
};
