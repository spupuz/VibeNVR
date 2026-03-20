import React from 'react';
import { InputField, SelectField, Slider, SectionHeader } from '../../../ui/FormControls';

export const OverlayTab = ({ newCamera, setNewCamera }) => {
    return (
        <div className="space-y-6">
            <SectionHeader title="Text Overlay" description="Configure on-screen text display" />

            {/* Left Text */}
            <SelectField
                label="Left Text"
                value={
                    newCamera.text_left === '' ? 'disabled' :
                        newCamera.text_left === '%$' ? 'name' :
                            newCamera.text_left === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                'custom'
                }
                onChange={(val) => {
                    if (val === 'disabled') setNewCamera({ ...newCamera, text_left: '' });
                    else if (val === 'name') setNewCamera({ ...newCamera, text_left: '%$' });
                    else if (val === 'timestamp') setNewCamera({ ...newCamera, text_left: '%Y-%m-%d %H:%M:%S' });
                    else if (val === 'custom') setNewCamera({ ...newCamera, text_left: 'Custom Text' });
                }}
                options={[
                    { value: 'name', label: 'Camera Name' },
                    { value: 'timestamp', label: 'Timestamp' },
                    { value: 'custom', label: 'Custom Text' },
                    { value: 'disabled', label: 'Disabled' }
                ]}
            />
            {/* Custom Input */}
            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_left) && (
                <InputField
                    value={newCamera.text_left}
                    onChange={(val) => setNewCamera({ ...newCamera, text_left: val })}
                    placeholder="Enter custom text"
                />
            )}

            {/* Right Text */}
            <SelectField
                label="Right Text"
                value={
                    newCamera.text_right === '' ? 'disabled' :
                        newCamera.text_right === '%$' ? 'name' :
                            newCamera.text_right === '%Y-%m-%d %H:%M:%S' ? 'timestamp' :
                                'custom'
                }
                onChange={(val) => {
                    if (val === 'disabled') setNewCamera({ ...newCamera, text_right: '' });
                    else if (val === 'name') setNewCamera({ ...newCamera, text_right: '%$' });
                    else if (val === 'timestamp') setNewCamera({ ...newCamera, text_right: '%Y-%m-%d %H:%M:%S' });
                    else if (val === 'custom') setNewCamera({ ...newCamera, text_right: 'Custom Text' });
                }}
                options={[
                    { value: 'name', label: 'Camera Name' },
                    { value: 'timestamp', label: 'Timestamp' },
                    { value: 'custom', label: 'Custom Text' },
                    { value: 'disabled', label: 'Disabled' }
                ]}
            />
            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_right) && (
                <InputField
                    value={newCamera.text_right}
                    onChange={(val) => setNewCamera({ ...newCamera, text_right: val })}
                    placeholder="Enter custom text"
                />
            )}

            <Slider
                label="Text Scale"
                value={newCamera.text_scale || 1}
                onChange={(val) => setNewCamera({ ...newCamera, text_scale: val })}
                min={1}
                max={50}
                step={1}
                unit="x"
            />
        </div>
    );
};
