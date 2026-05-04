import React from 'react';
import { Brain } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField, Toggle } from '../../../components/ui/FormControls';

export const AISettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="ai-settings"
            title="AI Detection Engine"
            description="Configure the global AI model architecture and performance."
            icon={<Brain className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6">
                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                    <Toggle
                        label="Global AI Activation"
                        help="When disabled, the AI engine is completely turned off to save system resources. Individual camera AI settings will be ignored."
                        checked={globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true"}
                        onChange={(val) => setGlobalSettings({ ...globalSettings, ai_enabled: val })}
                    />
                </div>

                <div className={!(globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true") ? 'opacity-50 pointer-events-none' : ''}>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Model Architecture</h4>
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        Choose the AI model architecture used for object detection. <strong>YOLOv8</strong> provides higher precision but requires more processing power.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectField
                            label="Global AI Model"
                            value={globalSettings.ai_model || 'mobilenet_ssd_v2'}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, ai_model: val })}
                            options={[
                                { value: 'mobilenet_ssd_v2', label: 'MobileNet SSD v2 (Standard)' },
                                { value: 'yolo_v8', label: 'YOLOv8 Nano (High Precision)' },
                            ]}
                            help="Switching models will affect all cameras with AI enabled."
                        />

                        <SelectField
                            label="Hardware Accelerator"
                            value={globalSettings.ai_hardware || 'auto'}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, ai_hardware: val })}
                            options={[
                                { value: 'auto', label: 'Auto (TPU > CPU)' },
                                { value: 'tpu', label: 'Google Coral TPU' },
                                { value: 'cpu', label: 'CPU (Standard)' },
                            ]}
                            help="Recommended: Google Coral TPU for YOLOv8."
                        />
                    </div>
                </div>

                <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-lg text-sm">
                    <strong className="flex items-center gap-2">TIP:</strong>
                    {!(globalSettings.ai_enabled === true || globalSettings.ai_enabled === "true") ? (
                        <span>AI is currently <strong>disabled</strong> globally. Enable it above to start using AI features.</span>
                    ) : (
                        <span>The selected model will be used by all cameras that have the "AI Engine" enabled. Specific camera settings can still be tuned individually.</span>
                    )}
                </div>
            </div>
        </CollapsibleSection>
    );
};
