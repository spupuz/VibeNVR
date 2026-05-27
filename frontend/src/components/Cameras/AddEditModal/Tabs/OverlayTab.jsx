import React from 'react';
import { InputField, SelectField, Slider, SectionHeader } from '../../../ui/FormControls';
import { useTranslation } from 'react-i18next';

export const OverlayTab = ({ newCamera, setNewCamera }) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-6">
            <SectionHeader title={t('cameras.text_overlay', 'Text Overlay')} description={t('cameras.configure_on_screen_text', 'Configure on-screen text display')} />

            {/* Left Text */}
            <SelectField
                label={t('cameras.left_text', 'Left Text')}
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
                    { value: 'name', label: t('cameras.camera_name', 'Camera Name') },
                    { value: 'timestamp', label: t('cameras.timestamp', 'Timestamp') },
                    { value: 'custom', label: t('cameras.custom_text', 'Custom Text') },
                    { value: 'disabled', label: t('cameras.disabled', 'Disabled') }
                ]}
            />
            {/* Custom Input */}
            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_left) && (
                <InputField
                    value={newCamera.text_left}
                    onChange={(val) => setNewCamera({ ...newCamera, text_left: val })}
                    placeholder={t('cameras.enter_custom_text', 'Enter custom text')}
                />
            )}

            {/* Right Text */}
            <SelectField
                label={t('cameras.right_text', 'Right Text')}
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
                    { value: 'name', label: t('cameras.camera_name', 'Camera Name') },
                    { value: 'timestamp', label: t('cameras.timestamp', 'Timestamp') },
                    { value: 'custom', label: t('cameras.custom_text', 'Custom Text') },
                    { value: 'disabled', label: t('cameras.disabled', 'Disabled') }
                ]}
            />
            {!['', '%$', '%Y-%m-%d %H:%M:%S'].includes(newCamera.text_right) && (
                <InputField
                    value={newCamera.text_right}
                    onChange={(val) => setNewCamera({ ...newCamera, text_right: val })}
                    placeholder={t('cameras.enter_custom_text', 'Enter custom text')}
                />
            )}

            <Slider
                label={t('cameras.text_scale', 'Text Scale')}
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
