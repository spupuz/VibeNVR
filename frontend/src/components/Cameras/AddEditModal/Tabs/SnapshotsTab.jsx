import React from 'react';
import { Image, Trash2 } from 'lucide-react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';
import { useTranslation } from 'react-i18next';

export const SnapshotsTab = ({ editingId, newCamera, setNewCamera, stats, handleCleanup, globalSettings }) => {
  const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.still_image_settings', 'Still Image Settings')} description={t('cameras.configure_snapshot_recor', 'Configure snapshot recording options')} />
            <Toggle
                label={t('cameras.auto_save_snapshots_on_m', 'Auto-save Snapshots on Motion')}
                checked={newCamera.picture_recording_mode === 'Motion Triggered'}
                onChange={(val) => setNewCamera({ ...newCamera, picture_recording_mode: val ? 'Motion Triggered' : 'Manual' })}
            />
            <Slider
                label={t('cameras.image_quality', 'Image Quality')}
                value={newCamera.picture_quality}
                onChange={(val) => setNewCamera({ ...newCamera, picture_quality: val })}
                min={10}
                max={100}
                step={5}
                unit="%"
                marks={['10%', '25%', '50%', '75%', '100%']}
            />
            <SectionHeader title={t('cameras.file_naming', 'File Naming')} />
            <InputField
                label={t('cameras.image_file_name', 'Image File Name')}
                value={newCamera.picture_file_name}
                onChange={(val) => setNewCamera({ ...newCamera, picture_file_name: val })}
                placeholder="%Y-%m-%d/%H-%M-%S-%q"
            />
            <SelectField
                label={t('cameras.preserve_pictures', 'Preserve Pictures')}
                value={(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.picture_preserve_pictures) && newCamera.picture_preserve_pictures !== undefined) ? 'Custom' : (newCamera.picture_preserve_pictures || 'Forever')}
                onChange={(val) => {
                    if (val === 'Custom') {
                        setNewCamera({ ...newCamera, picture_preserve_pictures: '14' });
                    } else {
                        setNewCamera({ ...newCamera, picture_preserve_pictures: val });
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
            {(!['Forever', 'For One Month', 'For One Week', 'For One Day'].includes(newCamera.picture_preserve_pictures) && newCamera.picture_preserve_pictures !== undefined) && (
                <InputField
                    label={t('cameras.custom_days', 'Custom Days')}
                    type="number"
                    value={parseInt(newCamera.picture_preserve_pictures) || 14}
                    onChange={(val) => setNewCamera({ ...newCamera, picture_preserve_pictures: String(val) })}
                    min={1}
                />
            )}
            <InputField
                label={t('cameras.maximum_pictures_storage_', 'Maximum Pictures Storage (GB)')}
                type="number"
                value={newCamera.max_pictures_storage_gb}
                onChange={(val) => setNewCamera({ ...newCamera, max_pictures_storage_gb: val })}
                unit="GB"
            />
            {stats?.details?.cameras?.[editingId] && (
                <div className="-mt-4 mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-green-500/10 rounded text-green-500">
                                <Image className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-sm">{t('cameras.snapshots_storage', 'Snapshots Storage')}</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCleanup(editingId, 'snapshot')}
                            className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                        >
                            <Trash2 className="w-3 h-3 mr-1" />
                            {t('cameras.clean_up', 'Clean Up')}
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <p className="text-xs text-muted-foreground">{t('cameras.disk_usage', 'Disk Usage')}</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].images.size_gb} GB</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t('cameras.total_files', 'Total Files')}</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].images.count}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                                {newCamera.max_pictures_storage_gb > 0
                                    ? `${Math.round((stats.details.cameras[editingId].images.size_gb / newCamera.max_pictures_storage_gb) * 100)}% ${t('cameras.used', 'Used')}`
                                    : t('cameras.unlimited_storage', 'Unlimited Storage')}
                            </span>
                            <span className="text-muted-foreground">
                                {t('cameras.limit', 'Limit:')} {newCamera.max_pictures_storage_gb > 0 ? `${newCamera.max_pictures_storage_gb} GB` : t('cameras.none', 'None')}
                            </span>
                        </div>
                        <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${newCamera.max_pictures_storage_gb > 0 && stats.details.cameras[editingId].images.size_gb > newCamera.max_pictures_storage_gb ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{
                                    width: newCamera.max_pictures_storage_gb > 0
                                        ? `${Math.min((stats.details.cameras[editingId].images.size_gb / newCamera.max_pictures_storage_gb) * 100, 100)}%`
                                        : '0%'
                                }}
                            />
                        </div>
                    </div>
                    {globalSettings?.max_global_storage_gb > 0 && (
                        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-600 dark:text-amber-400">
                            <strong>{t('cameras.effective_limit', 'Effective Limit:')}</strong> {t('cameras.this_camera_limited', 'This camera is currently limited to')} <strong>{Math.min(newCamera.max_pictures_storage_gb || Infinity, globalSettings.max_global_storage_gb)} GB</strong>. 
                            {t('cameras.more_restrictive_value', '(The more restrictive value between its limit and the Global Quota is applied)')}
                        </div>
                    )}
                </div>
            )}
            <Toggle
                label={t('cameras.show_manual_snapshot_butt', 'Show Manual Snapshot Button')}
                checked={newCamera.enable_manual_snapshots}
                onChange={(val) => setNewCamera({ ...newCamera, enable_manual_snapshots: val })}
            />
            <p className="text-xs text-muted-foreground">{t('cameras.enables_the_take_snapshot', "Enables the 'Take Snapshot' button in Live View.")}</p>
        </div>
    );
};
