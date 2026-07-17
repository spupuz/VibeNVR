import React from 'react';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField, Toggle } from '../../../components/ui/FormControls';

export const AISettings = ({
    globalSettings,
    setGlobalSettings,
    handleSave,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    return (
        <CollapsibleSection
            id="ai-settings"
            title={t('settings_aisettings.title', 'AI Detection Engine')}
            description={t('settings_aisettings.subtitle', 'Configure the global AI model architecture and performance.')}
            icon={<Brain className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6">
                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                    <Toggle
                        label={t('settings_forms.ai_activation', 'Global AI Activation')}
                        help={t('settings_forms.ai_activation_help', 'When disabled, the AI engine is completely turned off to save system resources. Individual camera AI settings will be ignored.')}
                        checked={globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true"}
                        onChange={(val) => {
                            const newSettings = { ...globalSettings, ai_enabled: val };
                            setGlobalSettings(newSettings);
                            if (handleSave) handleSave(newSettings);
                        }}
                    />
                </div>

                <div className={!(globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true") ? 'opacity-50 pointer-events-none' : ''}>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{t('settings_forms.ai_architecture', 'Model Architecture')}</h4>
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        {t('settings_forms.ai_arch_desc', 'Choose the AI model architecture used for object detection. YOLOv8 provides higher precision but requires more processing power.')}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectField
                            label={t('settings_forms.ai_model', 'Global AI Model')}
                            value={globalSettings.ai_model || 'mobilenet_ssd_v2'}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, ai_model: val })}
                            options={[
                                { value: 'mobilenet_ssd_v2', label: t('settings_forms.ai_mobilenet', 'MobileNet SSD v2 (Standard)') },
                                { value: 'yolo_v8', label: t('settings_forms.ai_yolo', 'YOLOv8 Nano (High Precision)') },
                            ]}
                            help={t('settings_forms.ai_model_help', 'Switching models will affect all cameras with AI enabled.')}
                        />

                        <SelectField
                            label={t('settings_forms.ai_hardware', 'Hardware Accelerator')}
                            value={globalSettings.ai_hardware || 'auto'}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, ai_hardware: val })}
                            options={[
                                { value: 'auto', label: t('settings_forms.ai_hw_auto', 'Auto (TPU > CPU)') },
                                { value: 'tpu', label: t('settings_forms.ai_hw_tpu', 'Google Coral TPU') },
                                { value: 'cpu', label: t('settings_forms.ai_hw_cpu', 'CPU (Standard)') },
                            ]}
                            help={t('settings_forms.ai_hw_help', 'Recommended: Google Coral TPU for YOLOv8.')}
                        />
                    </div>
                </div>

                <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-lg text-sm">
                    <strong className="flex items-center gap-2">{t('settings_forms.tip', 'TIP:')}</strong>
                    {!(globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true") ? (
                        <span>{t('settings_forms.ai_disabled_msg', 'AI is currently disabled globally. Enable it above to start using AI features.')}</span>
                    ) : (
                        <span>{t('settings_forms.ai_enabled_msg', 'The selected model will be used by all cameras that have the AI Engine enabled. Specific camera settings can still be tuned individually.')}</span>
                    )}
                </div>
            </div>
        </CollapsibleSection>
    );
};
