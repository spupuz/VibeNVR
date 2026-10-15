import React from 'react';
import { Toggle, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { useTranslation } from 'react-i18next';

export const SnapshotsTab = ({ newCamera, setNewCamera }) => {
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
            <Toggle
                label={t('cameras.show_manual_snapshot_butt', 'Show Manual Snapshot Button')}
                checked={newCamera.enable_manual_snapshots}
                onChange={(val) => setNewCamera({ ...newCamera, enable_manual_snapshots: val })}
            />
            <p className="text-xs text-muted-foreground">{t('cameras.enables_the_take_snapshot', "Enables the 'Take Snapshot' button in Live View.")}</p>
        </div>
    );
};
