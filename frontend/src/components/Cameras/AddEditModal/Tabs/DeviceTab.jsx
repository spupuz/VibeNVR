import React from 'react';
import { Toggle, SelectField, Slider, SectionHeader } from '../../../ui/FormControls';
import { useTranslation } from 'react-i18next';

export const DeviceTab = ({ newCamera, setNewCamera }) => {
  const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.resolution', 'Resolution')} description={t('cameras.configure_video_resolution_', 'Configure video resolution settings')} />
            <Toggle
                label={t('cameras.auto_detect_resolution', 'Auto-Detect Resolution')}
                checked={newCamera.auto_resolution !== false}
                onChange={(val) => setNewCamera({ ...newCamera, auto_resolution: val })}
                help={t('cameras.automatically_detect_camera', 'Automatically detect camera resolution on save. Disable to set manually.')}
            />
            {newCamera.auto_resolution !== false ? (
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('cameras.video_resolution', 'Video Resolution')}</label>
                    <div className="px-3 py-2 bg-muted/50 rounded-lg border border-border text-muted-foreground">
                        {newCamera.resolution_width}x{newCamera.resolution_height} {t('cameras.auto_detected', '(Auto-Detected)')}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('cameras.resolution_will_be_detect', 'Resolution will be detected automatically when you save.')}</p>
                </div>
            ) : (
                <SelectField
                    label={t('cameras.video_resolution_label', 'Video Resolution')}
                    value={`${newCamera.resolution_width}x${newCamera.resolution_height}`}
                    onChange={(val) => {
                        const [w, h] = val.split('x').map(Number);
                        setNewCamera({ ...newCamera, resolution_width: w, resolution_height: h });
                    }}
                    options={[
                        { value: '320x240', label: t('cameras.320x240_qvga', '320x240 (QVGA)') },
                        { value: '640x480', label: t('cameras.640x480_vga', '640x480 (VGA)') },
                        { value: '800x600', label: t('cameras.800x600_svga', '800x600 (SVGA)') },
                        { value: '1280x720', label: t('cameras.1280x720_hd', '1280x720 (HD)') },
                        { value: '1920x1080', label: t('cameras.1920x1080_full_hd', '1920x1080 (Full HD)') },
                        { value: '2560x1440', label: t('cameras.2560x1440_qhd', '2560x1440 (QHD)') },
                        { value: '3840x2160', label: t('cameras.3840x2160_4k', '3840x2160 (4K)') }
                    ]}
                />
            )}
            <SelectField
                label={t('cameras.video_rotation', 'Video Rotation')}
                value={`${newCamera.rotation}°`}
                onChange={(val) => setNewCamera({ ...newCamera, rotation: parseInt(val) })}
                options={[
                    { value: '0', label: '0°' },
                    { value: '90', label: '90°' },
                    { value: '180', label: '180°' },
                    { value: '270', label: '270°' }
                ]}
            />
            <SectionHeader title={t('cameras.frame_rate', 'Frame Rate')} description={t('cameras.frames_captured_per_second', 'Frames captured per second')} />
            <Slider
                label={t('cameras.frame_rate', 'Frame Rate')}
                value={newCamera.framerate}
                onChange={(val) => setNewCamera({ ...newCamera, framerate: val })}
                min={1}
                max={30}
                step={1}
                unit=" fps"
                marks={['1', '5', '10', '15', '20', '25', '30']}
            />

            <SectionHeader title={t('cameras.audio', 'Audio')} description={t('cameras.live_audio_listening_sett', 'Live audio listening settings')} />
            <Toggle
                label={t('cameras.enable_live_audio', 'Enable Live Audio')}
                checked={newCamera.enable_audio}
                onChange={(val) => setNewCamera({ ...newCamera, enable_audio: val })}
                disabled={!newCamera.audio_enabled}
                help={newCamera.audio_enabled ? t('cameras.enable_live_audio_listenin', "Enable live audio listening via WebSockets.") : t('cameras.audio_capability_not_detec', "Audio capability not detected for this camera via ONVIF.")}
            />
        </div>
    );
};
