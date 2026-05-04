import React from 'react';
import { Zap, Brain } from 'lucide-react';
import { Toggle, SelectField } from '../../../ui/FormControls';

export const AITab = ({ newCamera, setNewCamera }) => {
    const handleObjectToggle = (label) => {
        const current = newCamera.ai_object_types || [];
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
            {newCamera.detect_engine !== 'AI' && (
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <Toggle
                        label="Enable AI Inference"
                        help="Run deep learning models on motion events to identify objects."
                        checked={newCamera.ai_enabled}
                        onChange={(val) => setNewCamera({ ...newCamera, ai_enabled: val })}
                    />
                </div>
            )}

            {(newCamera.ai_enabled || newCamera.detect_engine === 'AI') && (
                <>
                    <div className="space-y-4">
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
                                    onClick={() => handleObjectToggle(obj.id)}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                        (newCamera.ai_object_types || []).includes(obj.id)
                                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                            : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                                    }`}
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

                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
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

                    <div className="p-4 bg-muted/30 rounded-xl border border-border">
                        <Toggle
                            label="Object Tracking"
                            help="Track objects across frames to reduce false positives."
                            checked={newCamera.ai_tracking_enabled}
                            onChange={(val) => setNewCamera({ ...newCamera, ai_tracking_enabled: val })}
                        />
                    </div>
                </>
            )}
        </div>
    );
};
