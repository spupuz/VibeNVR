import React, { useState } from 'react';
import { ChevronDown, Film, Image, Trash2 } from 'lucide-react';
import { InputField, SelectField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';
import { useTranslation } from 'react-i18next';

export const StorageTab = ({ editingId, newCamera, setNewCamera, storageProfiles, stats, handleCleanup, globalSettings }) => {
    const { t } = useTranslation();
    const [routingOpen, setRoutingOpen] = useState(false);
    const [limitsOpen, setLimitsOpen] = useState(false);
    const cameraStats = stats?.details?.cameras?.[editingId];
    const profileName = (id) => storageProfiles.find(profile => String(profile.id) === String(id))?.name || t('storage_ui.unavailable_profile', 'Unavailable profile');
    const recordingLocation = newCamera.storage_profile_id ? profileName(newCamera.storage_profile_id) : t('storage_ui.default_location', 'Default');
    const retentionDuration = (value) => {
        const days = { 'For One Day': 1, 'For One Week': 7, 'For One Month': 30 };
        return t('storage_ui.duration_days', '{{count}} days', { count: days[value] || parseInt(value) || 14 });
    };
    const videoRetention = (!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_movies) && newCamera.preserve_movies !== undefined)
        ? String(parseInt(newCamera.preserve_movies) || 14) : (newCamera.preserve_movies || 'For One Week');
    const snapshotRetention = (!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_pictures) && newCamera.preserve_pictures !== undefined)
        ? String(parseInt(newCamera.preserve_pictures) || 14) : (newCamera.preserve_pictures || 'Forever');

    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.storage', 'Storage')} description={t('cameras.where_to_save_recording', 'Where to save recordings and snapshots')} />
            <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="text-sm font-semibold">{t('storage_ui.save_step', '1. Save recordings')}</h4>
                <SelectField
                    label={t('storage_ui.recording_location', 'Recording location')}
                    value={newCamera.storage_profile_id || ''}
                    onChange={(val) => setNewCamera({ ...newCamera, storage_profile_id: val === '' ? null : parseInt(val) })}
                    options={[
                        { value: '', label: t('cameras.default_var_lib_vibe_re', 'Default (/var/lib/vibe/recordings)') },
                        ...storageProfiles.map(p => ({ value: p.id.toString(), label: `${p.name} (${p.path})` }))
                    ]}
                    help={t('cameras.select_a_custom_storage', "Select a custom storage location for this camera's media.")}
                />
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="text-sm font-semibold">{t('storage_ui.move_step', '2. Move older recordings')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField
                        label={t('storage_ui.move_destination', 'Move to')}
                        value={newCamera.archive_storage_profile_id || ''}
                        onChange={(val) => setNewCamera({ ...newCamera, archive_storage_profile_id: val === '' ? null : parseInt(val) })}
                        options={[{ value: '', label: t('settings_forms.disabled', 'Disabled') }, ...storageProfiles.map(p => ({ value: p.id.toString(), label: p.name }))]}
                    />
                    {newCamera.archive_storage_profile_id ? (
                        <InputField
                            label={t('storage_ui.move_age', 'Move after (hours)')}
                            type="number"
                            min={0}
                            value={newCamera.archive_after_hours || 0}
                            onChange={(val) => setNewCamera({ ...newCamera, archive_after_hours: parseInt(val) || 0 })}
                            help={t('storage_ui.move_after_help', 'Recordings become eligible after this age and move on the next global archival check. Zero disables archival for this camera.')}
                        />
                    ) : <div />}
                </div>
                <p className="text-xs text-muted-foreground">{t('storage_ui.move_explanation', 'Moves files to another location. They remain available in the timeline.')}</p>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="text-sm font-semibold">{t('storage_ui.delete_step', '3. Delete older recordings')}</h4>
                <p className="text-xs text-muted-foreground">{t('storage_ui.delete_explanation', 'Applies to both original and moved files. Age is counted from recording time, not from when files were moved.')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <SelectField
                            label={t('storage_ui.delete_videos', 'Delete videos after')}
                            value={(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_movies) && newCamera.preserve_movies !== undefined) ? 'Custom' : (newCamera.preserve_movies || 'For One Week')}
                            onChange={(val) => {
                                if (val === 'Custom') {
                                    setNewCamera({ ...newCamera, preserve_movies: '14' });
                                } else {
                                    setNewCamera({ ...newCamera, preserve_movies: val });
                                }
                            }}
                            options={[
                                { value: 'Forever', label: t('storage_ui.never', 'Never') },
                                { value: 'For One Month', label: t('storage_ui.duration_days', '{{count}} days', { count: 30 }) },
                                { value: 'For One Week', label: t('storage_ui.duration_days', '{{count}} days', { count: 7 }) },
                                { value: 'For One Day', label: t('storage_ui.duration_days', '{{count}} days', { count: 1 }) },
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
                    </div>
                    <div className="space-y-4">
                        <SelectField
                            label={t('storage_ui.delete_snapshots', 'Delete snapshots after')}
                            value={(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_pictures) && newCamera.preserve_pictures !== undefined) ? 'Custom' : (newCamera.preserve_pictures || 'Forever')}
                            onChange={(val) => {
                                if (val === 'Custom') {
                                    setNewCamera({ ...newCamera, preserve_pictures: '14' });
                                } else {
                                    setNewCamera({ ...newCamera, preserve_pictures: val });
                                }
                            }}
                            options={[
                                { value: 'Forever', label: t('storage_ui.never', 'Never') },
                                { value: 'For One Month', label: t('storage_ui.duration_days', '{{count}} days', { count: 30 }) },
                                { value: 'For One Week', label: t('storage_ui.duration_days', '{{count}} days', { count: 7 }) },
                                { value: 'For One Day', label: t('storage_ui.duration_days', '{{count}} days', { count: 1 }) },
                                { value: 'Custom', label: t('cameras.custom_days', 'Custom (Days)') }
                            ]}
                        />
                        {(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.preserve_pictures) && newCamera.preserve_pictures !== undefined) && (
                            <InputField
                                label={t('cameras.custom_days', 'Custom Days')}
                                type="number"
                                value={parseInt(newCamera.preserve_pictures) || 14}
                                onChange={(val) => setNewCamera({ ...newCamera, preserve_pictures: String(val) })}
                                min={1}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <h4 className="text-sm font-semibold">{t('storage_ui.policy_summary', 'Selected storage policy')}</h4>
                <ul className="space-y-2 text-sm">
                    <li>{t('storage_ui.summary_save', 'Save to {{location}}.', { location: recordingLocation })}</li>
                    {[
                        { id: newCamera.motion_storage_profile_id, label: t('cameras.motion_storage_profile', 'Motion Storage Profile') },
                        { id: newCamera.continuous_storage_profile_id, label: t('cameras.continuous_storage_profile', 'Continuous Storage Profile') },
                        { id: newCamera.snapshot_storage_profile_id, label: t('cameras.snapshot_storage_profile', 'Snapshot Storage Profile') }
                    ].filter(route => route.id).map(route => (
                        <li key={route.label} className="text-xs text-muted-foreground">{route.label}: {profileName(route.id)}</li>
                    ))}
                    <li>{newCamera.archive_storage_profile_id && newCamera.archive_after_hours > 0
                        ? t('storage_ui.summary_move', 'Move to {{location}} after {{hours}} hours, on the next scheduled check.', { location: profileName(newCamera.archive_storage_profile_id), hours: newCamera.archive_after_hours })
                        : t('storage_ui.summary_no_move', 'No automatic move.')}</li>
                    <li>{videoRetention === 'Forever'
                        ? t('storage_ui.summary_video_never', 'Videos: no age-based deletion.')
                        : t('storage_ui.summary_video_delete', 'Videos: delete after {{duration}}.', { duration: retentionDuration(videoRetention) })}</li>
                    <li>{snapshotRetention === 'Forever'
                        ? t('storage_ui.summary_snapshot_never', 'Snapshots: no age-based deletion.')
                        : t('storage_ui.summary_snapshot_delete', 'Snapshots: delete after {{duration}}.', { duration: retentionDuration(snapshotRetention) })}</li>
                </ul>
                {globalSettings?.archival_enabled === false && newCamera.archive_storage_profile_id && newCamera.archive_after_hours > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t('storage_ui.move_paused', 'Automatic moving is disabled in Settings → Storage. The move policy above will not run until enabled.')}</p>
                )}
                {globalSettings?.cleanup_enabled === false && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t('storage_ui.delete_paused', 'Automatic cleanup is disabled in Settings → Storage. Age-based deletion will not run automatically; manual cleanup can still delete files.')}</p>
                )}
                <p className="text-xs text-muted-foreground">{t('storage_ui.policy_timing', 'Moves and age-based deletion happen on scheduled checks configured in Settings → Storage. Moving requires automatic archival to be enabled. Storage limits or low disk space may cause earlier deletion, even when an age limit is set to Never.')}</p>
                {newCamera.max_storage_gb > 0 && <p className="text-xs text-muted-foreground">{t('storage_ui.video_limit', 'Video size limit')}: {newCamera.max_storage_gb} GB</p>}
                {newCamera.max_pictures_storage_gb > 0 && <p className="text-xs text-muted-foreground">{t('storage_ui.snapshot_limit', 'Snapshot size limit')}: {newCamera.max_pictures_storage_gb} GB</p>}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
                <button
                    type="button"
                    aria-expanded={limitsOpen}
                    aria-controls="camera-storage-limits"
                    onClick={() => setLimitsOpen(!limitsOpen)}
                    className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold min-h-[44px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <span>{t('storage_ui.advanced_limits', 'Advanced storage limits')}</span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${limitsOpen ? 'rotate-180' : ''}`} />
                </button>
                <p className="text-xs text-muted-foreground">{t('storage_ui.limits_help', 'Size limits can delete the oldest files before their age limit. Existing limits remain active when collapsed. Zero means no camera size limit.')}</p>
                {limitsOpen && (
                    <div id="camera-storage-limits" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField
                            label={t('storage_ui.video_limit', 'Video size limit')}
                            type="number"
                            value={newCamera.max_storage_gb || 0}
                            onChange={(val) => setNewCamera({ ...newCamera, max_storage_gb: val })}
                            unit="GB"
                            placeholder={t('cameras.0_unlimited', '0 = unlimited')}
                        />
                        <InputField
                            label={t('storage_ui.snapshot_limit', 'Snapshot size limit')}
                            type="number"
                            value={newCamera.max_pictures_storage_gb}
                            onChange={(val) => setNewCamera({ ...newCamera, max_pictures_storage_gb: val })}
                            unit="GB"
                        />
                    </div>
                )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
                <button
                    type="button"
                    aria-expanded={routingOpen}
                    aria-controls="camera-storage-routing"
                    onClick={() => setRoutingOpen(!routingOpen)}
                    className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold min-h-[44px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <span>{t('storage_ui.advanced_routing', 'Advanced recording routing')}</span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${routingOpen ? 'rotate-180' : ''}`} />
                </button>
                <p className="text-xs text-muted-foreground">{t('storage_ui.routing_help', 'Override the recording destination for motion, continuous video, or snapshots. Existing overrides remain active when collapsed.')}</p>
                {routingOpen && (
                    <div id="camera-storage-routing" className="space-y-4">
                        <SelectField
                            label={t('cameras.motion_storage_profile', 'Motion Storage Profile')}
                            value={newCamera.motion_storage_profile_id || ''}
                            onChange={(val) => setNewCamera({ ...newCamera, motion_storage_profile_id: val === '' ? null : parseInt(val) })}
                            options={[{ value: '', label: t('cameras.use_default_profile', 'Use Default Profile') }, ...storageProfiles.map(p => ({ value: p.id.toString(), label: p.name }))]}
                        />
                        <SelectField
                            label={t('cameras.continuous_storage_profile', 'Continuous Storage Profile')}
                            value={newCamera.continuous_storage_profile_id || ''}
                            onChange={(val) => setNewCamera({ ...newCamera, continuous_storage_profile_id: val === '' ? null : parseInt(val) })}
                            options={[{ value: '', label: t('cameras.use_default_profile', 'Use Default Profile') }, ...storageProfiles.map(p => ({ value: p.id.toString(), label: p.name }))]}
                        />
                        <SelectField
                            label={t('cameras.snapshot_storage_profile', 'Snapshot Storage Profile')}
                            value={newCamera.snapshot_storage_profile_id || ''}
                            onChange={(val) => setNewCamera({ ...newCamera, snapshot_storage_profile_id: val === '' ? null : parseInt(val) })}
                            options={[{ value: '', label: t('cameras.use_default_profile', 'Use Default Profile') }, ...storageProfiles.map(p => ({ value: p.id.toString(), label: p.name }))]}
                        />
                    </div>
                )}
            </div>

            {cameraStats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                        { type: 'video', data: cameraStats.movies, limit: newCamera.max_storage_gb, title: t('cameras.movies_storage', 'Movies Storage'), icon: Film },
                        { type: 'snapshot', data: cameraStats.images, limit: newCamera.max_pictures_storage_gb, title: t('cameras.snapshots_storage', 'Snapshots Storage'), icon: Image }
                    ].map(media => (
                        <div key={media.type} className="p-4 bg-muted/30 rounded-lg border border-border space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="flex items-center gap-2 text-sm font-semibold">
                                    <media.icon className="w-4 h-4 shrink-0" />
                                    {media.title}
                                </h4>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanup(editingId, media.type)}
                                    className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t('cameras.clean_up', 'Clean Up')}
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('storage_ui.tracked_recordings', 'VibeNVR tracked recordings')}</p>
                                    <p className="text-lg font-bold">{media.data.size_gb} GB</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('cameras.total_files', 'Total Files')}</p>
                                    <p className="text-lg font-bold">{media.data.count}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                                <span>{media.limit > 0 ? `${Math.round((media.data.size_gb / media.limit) * 100)}% ${t('cameras.used', 'Used')}` : t('cameras.unlimited_storage', 'Unlimited Storage')}</span>
                                <span>{t('cameras.limit', 'Limit:')} {media.limit > 0 ? `${media.limit} GB` : t('cameras.none', 'None')}</span>
                            </div>
                            <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${media.limit > 0 && media.data.size_gb > media.limit ? 'bg-red-500' : 'bg-primary'}`}
                                    style={{ width: media.limit > 0 ? `${Math.min((media.data.size_gb / media.limit) * 100, 100)}%` : '0%' }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {globalSettings?.max_global_storage_gb > 0 && (
                <p className="text-xs text-muted-foreground">{t('settings_forms.storage_note_desc', 'Camera-specific quotas are secondary to this global limit. If the global limit is reached, the oldest files across ALL cameras will be cleaned up regardless of individual camera settings.')} ({globalSettings.max_global_storage_gb} GB)</p>
            )}
        </div>
    );
};
