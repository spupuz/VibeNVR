import React from 'react';
import { Film, Trash2 } from 'lucide-react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';
import { useTranslation } from 'react-i18next';

export const MoviesTab = ({ editingId, newCamera, setNewCamera, stats, handleCleanup, globalSettings }) => {
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
                value={newCamera.max_movie_length || 120}
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
            <SelectField
                label={t('cameras.preserve_movies', 'Preserve Movies')}
                value={(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_movies) && newCamera.preserve_movies !== undefined) ? 'Custom' : (newCamera.preserve_movies || 'For One Week')}
                onChange={(val) => {
                    if (val === 'Custom') {
                        setNewCamera({ ...newCamera, preserve_movies: '14' });
                    } else {
                        setNewCamera({ ...newCamera, preserve_movies: val });
                    }
                }}
                options={[
                    { value: 'Forever', label: t('cameras.forever', 'Forever') },
                    { value: 'For One Month', label: t('cameras.for_one_month', 'For One Month') },
                    { value: 'For One Week', label: t('cameras.for_one_week', 'For One Week') },
                    { value: 'For One Day', label: t('cameras.for_one_day', 'For One Day') },
                    { value: 'Custom', label: t('cameras.custom_days', 'Custom (Days)') }
                ]}
            />
            {(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_movies) && newCamera.preserve_movies !== undefined) && (
                <InputField
                    label={t('cameras.custom_days', 'Custom Days')}
                    type="number"
                    value={parseInt(newCamera.preserve_movies) || 14}
                    onChange={(val) => setNewCamera({ ...newCamera, preserve_movies: String(val) })}
                    min={1}
                />
            )}
            <SectionHeader title={t('cameras.storage_limit', 'Storage Limit')} description={t('cameras.auto_delete_old_files_whe', 'Auto-delete old files when limit is reached')} />
            {stats?.details?.cameras?.[editingId] && (
                <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-blue-500/10 rounded text-blue-500">
                                <Film className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-sm">{t('cameras.movies_storage', 'Movies Storage')}</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCleanup(editingId, 'video')}
                            className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                        >
                            <Trash2 className="w-3 h-3 mr-1" />
                            {t('cameras.clean_up', 'Clean Up')}
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <p className="text-xs text-muted-foreground">{t('cameras.disk_usage', 'Disk Usage')}</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.size_gb} GB</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t('cameras.total_files', 'Total Files')}</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.count}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                                {newCamera.max_storage_gb > 0
                                    ? `${Math.round((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100)}% ${t('cameras.used', 'Used')}`
                                    : t('cameras.unlimited_storage', 'Unlimited Storage')}
                            </span>
                            <span className="text-muted-foreground">
                                {t('cameras.limit', 'Limit:')} {newCamera.max_storage_gb > 0 ? `${newCamera.max_storage_gb} GB` : t('cameras.none', 'None')}
                            </span>
                        </div>
                        <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${newCamera.max_storage_gb > 0 && stats.details.cameras[editingId].movies.size_gb > newCamera.max_storage_gb ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{
                                    width: newCamera.max_storage_gb > 0
                                        ? `${Math.min((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100, 100)}%`
                                        : '0%'
                                }}
                            />
                        </div>
                    </div>
                    {globalSettings?.max_global_storage_gb > 0 && (
                        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-600 dark:text-amber-400">
                            <strong>{t('cameras.effective_limit', 'Effective Limit:')}</strong> {t('cameras.this_camera_limited', 'This camera is currently limited to')} <strong>{Math.min(newCamera.max_storage_gb || Infinity, globalSettings.max_global_storage_gb)} GB</strong>. 
                            {t('cameras.more_restrictive_value', '(The more restrictive value between its limit and the Global Quota is applied)')}
                        </div>
                    )}
                </div>
            )}
            <InputField
                label={t('cameras.maximum_storage_gb', 'Maximum Storage (GB)')}
                type="number"
                value={newCamera.max_storage_gb || 0}
                onChange={(val) => setNewCamera({ ...newCamera, max_storage_gb: val })}
                unit="GB"
                placeholder={t('cameras.0_unlimited', '0 = unlimited')}
            />
            <p className="text-xs text-muted-foreground">{t('cameras.set_to_0_for_unlimited_st', 'Set to 0 for unlimited storage. When exceeded, oldest files are deleted.')}</p>
        </div>
    );
};
