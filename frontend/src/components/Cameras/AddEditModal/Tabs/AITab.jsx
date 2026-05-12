import React from 'react';
import { Zap, Brain } from 'lucide-react';
import { Toggle, SelectField } from '../../../ui/FormControls';

export const AITab = ({ newCamera, setNewCamera, globalSettings }) => {
    const isAiEnabledGlobally = globalSettings?.ai_enabled?.value === 'true' || globalSettings?.ai_enabled === true || globalSettings?.ai_enabled === "true";
    const isAiDisabledGlobally = !isAiEnabledGlobally;

    const handleObjectToggle = (label) => {
        if (isAiDisabledGlobally) return;
        // Ensure we always work with an array, even if corrupted data exists
        let current = newCamera.ai_object_types;
        if (typeof current === 'string') {
            try {
                current = JSON.parse(current);
            } catch (e) {
                current = [];
            }
        }
        if (!Array.isArray(current)) current = [];

        const next = current.includes(label)
            ? current.filter(l => l !== label)
            : [...current, label];
        setNewCamera({ ...newCamera, ai_object_types: next });
    };

    const objects = [
        { id: 'person', label: 'Person' },
        { id: 'vehicle', label: 'Vehicle' },
        { id: 'bicycle', label: 'Bicycle' },
        { id: 'motorcycle', label: 'Motorcycle' },
        { id: 'bus', label: 'Bus' },
        { id: 'truck', label: 'Truck' },
        { id: 'dog', label: 'Dog' },
        { id: 'cat', label: 'Cat' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {isAiDisabledGlobally && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                    <Brain className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-amber-600 dark:text-amber-400">AI Engine is Disabled</h4>
                        <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 mt-1">
                            The global AI activation switch is currently <strong>OFF</strong>. This camera will fallback to <strong>OpenCV</strong> motion detection even if AI is enabled here.
                        </p>
                        <p className="text-[10px] text-amber-600/60 dark:text-amber-400/50 mt-2 italic">
                            Enable it in Settings &gt; AI Detection Engine to use these features.
                        </p>
                    </div>
                </div>
            )}

            <div className={isAiDisabledGlobally ? 'opacity-50 pointer-events-none grayscale-[50%]' : ''}>
                {newCamera.detect_engine !== 'AI' && (
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                        <Toggle
                            label="Enable AI Inference"
                            help="Run deep learning models on motion events to identify objects."
                            checked={newCamera.ai_enabled}
                            onChange={(val) => setNewCamera({ ...newCamera, ai_enabled: val })}
                            disabled={isAiDisabledGlobally}
                        />
                    </div>
                )}

                {(newCamera.ai_enabled || newCamera.detect_engine === 'AI') && (
                    <>
                        <div className="space-y-4 mt-6">
                            <div className="flex items-center gap-2 text-primary">
                                <Zap className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Object Filters</span>
                            </div>
                            {newCamera.detect_engine === 'AI' && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-500/5 p-2 rounded border border-blue-500/10 italic">
                                    <strong>Note:</strong> Since you selected "AI" as the Detection Engine, these objects are the <u>only</u> thing that will trigger a motion event.
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {objects.map(obj => (
                                    <button
                                        key={obj.id}
                                        type="button"
                                        disabled={isAiDisabledGlobally}
                                        onClick={() => handleObjectToggle(obj.id)}
                                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                            (newCamera.ai_object_types || []).includes(obj.id)
                                                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                                : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                                        } ${isAiDisabledGlobally ? 'cursor-not-allowed' : ''}`}
                                    >
                                        <span className="text-xs font-medium">{obj.label}</span>
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                            (newCamera.ai_object_types || []).includes(obj.id)
                                                ? 'bg-primary border-primary'
                                                : 'border-muted-foreground/30'
                                        }`}>
                                            {(newCamera.ai_object_types || []).includes(obj.id) && (
                                                <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 mt-6">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                    Confidence Threshold
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="0.95"
                                        step="0.05"
                                        disabled={isAiDisabledGlobally}
                                        value={newCamera.ai_threshold || 0.5}
                                        onChange={(e) => setNewCamera({ ...newCamera, ai_threshold: parseFloat(e.target.value) })}
                                        className="flex-1 accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs font-mono w-8 text-right">
                                        {Math.round((newCamera.ai_threshold || 0.5) * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-xl border border-border mt-6">
                            <Toggle
                                label="Object Tracking"
                                help="Track objects across frames to reduce false positives."
                                checked={newCamera.ai_tracking_enabled}
                                onChange={(val) => setNewCamera({ ...newCamera, ai_tracking_enabled: val })}
                                disabled={isAiDisabledGlobally}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
