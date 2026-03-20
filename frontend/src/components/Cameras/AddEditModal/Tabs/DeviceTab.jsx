import React from 'react';
import { Toggle, SelectField, Slider, SectionHeader } from '../../../ui/FormControls';

export const DeviceTab = ({ newCamera, setNewCamera }) => {
    return (
        <div className="space-y-6">
            <SectionHeader title="Resolution" description="Configure video resolution settings" />
            <Toggle
                label="Auto-Detect Resolution"
                checked={newCamera.auto_resolution !== false}
                onChange={(val) => setNewCamera({ ...newCamera, auto_resolution: val })}
                help="Automatically detect camera resolution on save. Disable to set manually."
            />
            {newCamera.auto_resolution !== false ? (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Video Resolution</label>
                    <div className="px-3 py-2 bg-muted/50 rounded-lg border border-border text-muted-foreground">
                        {newCamera.resolution_width}x{newCamera.resolution_height} (Auto-Detected)
                    </div>
                    <p className="text-xs text-muted-foreground">Resolution will be detected automatically when you save.</p>
                </div>
            ) : (
                <SelectField
                    label="Video Resolution"
                    value={`${newCamera.resolution_width}x${newCamera.resolution_height}`}
                    onChange={(val) => {
                        const [w, h] = val.split('x').map(Number);
                        setNewCamera({ ...newCamera, resolution_width: w, resolution_height: h });
                    }}
                    options={[
                        { value: '320x240', label: '320x240 (QVGA)' },
                        { value: '640x480', label: '640x480 (VGA)' },
                        { value: '800x600', label: '800x600 (SVGA)' },
                        { value: '1280x720', label: '1280x720 (HD)' },
                        { value: '1920x1080', label: '1920x1080 (Full HD)' },
                        { value: '2560x1440', label: '2560x1440 (QHD)' },
                        { value: '3840x2160', label: '3840x2160 (4K)' }
                    ]}
                />
            )}
            <SelectField
                label="Video Rotation"
                value={`${newCamera.rotation}°`}
                onChange={(val) => setNewCamera({ ...newCamera, rotation: parseInt(val) })}
                options={[
                    { value: '0', label: '0°' },
                    { value: '90', label: '90°' },
                    { value: '180', label: '180°' },
                    { value: '270', label: '270°' }
                ]}
            />
            <SectionHeader title="Frame Rate" description="Frames captured per second" />
            <Slider
                label="Frame Rate"
                value={newCamera.framerate}
                onChange={(val) => setNewCamera({ ...newCamera, framerate: val })}
                min={1}
                max={30}
                step={1}
                unit=" fps"
                marks={['1', '5', '10', '15', '20', '25', '30']}
            />
        </div>
    );
};
