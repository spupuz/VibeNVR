import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { SelectField, Toggle, InputField } from '../../../components/ui/FormControls';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';

export const AISettings = ({
    globalSettings,
    setGlobalSettings,
    handleSave,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { token } = useAuth();
    const [isTesting, setIsTesting] = useState(false);

    const testVisionLLM = async () => {
        setIsTesting(true);
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/settings/test-vision-llm', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    base_url: globalSettings.llm_enricher_base_url || 'http://localhost:11434/v1',
                    api_key: globalSettings.llm_enricher_api_key || '',
                    model: globalSettings.llm_enricher_model || 'llama3.2-vision',
                    prompt: globalSettings.llm_enricher_prompt || undefined
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(t('settings_aisettings.test_success', 'LLM Connection successful! Response: {{response}}', { response: data.response }), 'success');
            } else {
                showToast(data.detail || t('settings_aisettings.test_failed', 'LLM Connection failed'), 'error');
            }
        } catch (err) {
            showToast(err.message || t('settings_aisettings.test_failed', 'LLM Connection failed'), 'error');
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <CollapsibleSection
            id="ai-settings"
            title={t('settings_aisettings.title', 'AI Detection Engine')}
            description={t('settings_aisettings.subtitle', 'Configure the global AI model architecture, performance, and Vision LLM smart captioning.')}
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

                {/* Vision LLM Smart Event Enricher */}
                <div className="border-t border-border/50 pt-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('settings_aisettings.llm_title', 'Smart Event Enricher (Vision LLM)')}
                        </h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        {t('settings_aisettings.llm_desc', 'Generates concise natural language descriptions of events (e.g. "Delivery driver dropping package") via OpenAI-compatible endpoints or local Ollama (Llama 3.2 Vision, Moondream, etc.). Operates asynchronously on event snapshots with zero impact on stream FPS.')}
                    </p>

                    <div className="bg-muted/30 p-4 rounded-xl border border-border/50 mb-4">
                        <Toggle
                            label={t('settings_aisettings.llm_enable', 'Enable Vision LLM Smart Captioning')}
                            help={t('settings_aisettings.llm_enable_help', 'When enabled, snapshots of confirmed events are analyzed asynchronously to produce smart captions.')}
                            checked={globalSettings.llm_enricher_enabled === true || globalSettings.llm_enricher_enabled === "true"}
                            onChange={(val) => {
                                const newSettings = { ...globalSettings, llm_enricher_enabled: val };
                                setGlobalSettings(newSettings);
                                if (handleSave) handleSave(newSettings);
                            }}
                        />
                    </div>

                    {(globalSettings.llm_enricher_enabled === true || globalSettings.llm_enricher_enabled === "true") && (
                        <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField
                                    label={t('settings_aisettings.llm_base_url', 'Endpoint Base URL')}
                                    placeholder="http://localhost:11434/v1"
                                    value={globalSettings.llm_enricher_base_url ?? 'http://localhost:11434/v1'}
                                    onChange={(val) => setGlobalSettings({ ...globalSettings, llm_enricher_base_url: val })}
                                    help={t('settings_aisettings.llm_base_url_help', 'Compatible with Ollama (http://host:11434/v1), OpenAI (https://api.openai.com/v1), vLLM, LMStudio, etc.')}
                                />

                                <InputField
                                    label={t('settings_aisettings.llm_model', 'Model Name')}
                                    placeholder="llama3.2-vision"
                                    value={globalSettings.llm_enricher_model ?? 'llama3.2-vision'}
                                    onChange={(val) => setGlobalSettings({ ...globalSettings, llm_enricher_model: val })}
                                    help={t('settings_aisettings.llm_model_help', 'E.g. llama3.2-vision, moondream, gpt-4o-mini, qwen2-vl')}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField
                                    label={t('settings_aisettings.llm_api_key', 'API Key (Optional)')}
                                    placeholder="sk-..."
                                    type="password"
                                    showPasswordToggle={true}
                                    value={globalSettings.llm_enricher_api_key ?? ''}
                                    onChange={(val) => setGlobalSettings({ ...globalSettings, llm_enricher_api_key: val })}
                                    help={t('settings_aisettings.llm_api_key_help', 'Leave empty for local Ollama without authentication.')}
                                />

                                <InputField
                                    label={t('settings_aisettings.llm_filter_classes', 'Filter Classes (Optional)')}
                                    placeholder="person, car, truck"
                                    value={globalSettings.llm_enricher_filter_classes ?? ''}
                                    onChange={(val) => setGlobalSettings({ ...globalSettings, llm_enricher_filter_classes: val })}
                                    help={t('settings_aisettings.llm_filter_classes_help', 'Comma-separated labels to trigger LLM analysis (e.g. person, car). Leave blank to analyze all events.')}
                                />
                            </div>

                            <InputField
                                label={t('settings_aisettings.llm_prompt', 'Custom Prompt (Optional)')}
                                placeholder="Describe concisely in 1-2 sentences what is happening in this security snapshot..."
                                value={globalSettings.llm_enricher_prompt ?? ''}
                                onChange={(val) => setGlobalSettings({ ...globalSettings, llm_enricher_prompt: val })}
                                help={t('settings_aisettings.llm_prompt_help', 'Leave blank to use the built-in security analyst prompt.')}
                            />

                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    disabled={isTesting}
                                    onClick={testVisionLLM}
                                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {isTesting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('common.testing', 'Testing Connection...')}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            {t('settings_aisettings.test_btn', 'Test Vision LLM')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
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

