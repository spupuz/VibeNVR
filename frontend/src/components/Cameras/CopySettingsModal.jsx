import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Portal } from '../ui/Portal';
import { Button } from '../ui/Button';
import { CAMERA_SETTINGS_CATEGORIES } from '../../utils/cameraSettingsMapping';

export const CopySettingsModal = ({
    showCopyModal,
    setShowCopyModal,
    cameras,
    editingId,
    copyTargets,
    setCopyTargets,
    handleCopySettings
}) => {
    const [selectedCategories, setSelectedCategories] = useState(CAMERA_SETTINGS_CATEGORIES.map(c => c.id));

    if (!showCopyModal) return null;

    const toggleCategory = (id) => {
        if (selectedCategories.includes(id)) {
            setSelectedCategories(selectedCategories.filter(c => c !== id));
        } else {
            setSelectedCategories([...selectedCategories, id]);
        }
    };

    const handleCopy = () => {
        handleCopySettings(selectedCategories);
    };

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] lg:pl-64 p-4">
                <div className="bg-card p-6 rounded-xl w-full max-w-lg border border-border shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="flex items-center gap-2 mb-2">
                        <Copy className="w-5 h-5 text-blue-500" />
                        <h3 className="text-lg font-bold">Copy Settings</h3>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-6">
                        Select target cameras and settings categories to overwrite. <br />
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">Warning: This will replace configuration for selected cameras.</span>
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                        {/* Categories Selection */}
                        <div className="flex flex-col h-full overflow-hidden">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Settings Categories</span>
                            <div className="space-y-1.5 overflow-y-auto pr-2 bg-muted/20 p-2 rounded-lg border border-border/50">
                                {CAMERA_SETTINGS_CATEGORIES.map(cat => (
                                    <div
                                        key={cat.id}
                                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${selectedCategories.includes(cat.id) ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'hover:bg-muted text-muted-foreground'}`}
                                        onClick={() => toggleCategory(cat.id)}
                                    >
                                        <span className="text-sm font-medium">{cat.label}</span>
                                        <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${selectedCategories.includes(cat.id) ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/30'}`}>
                                            {selectedCategories.includes(cat.id) && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button className="text-[10px] uppercase font-bold text-blue-600 hover:underline" onClick={() => setSelectedCategories(CAMERA_SETTINGS_CATEGORIES.map(c => c.id))}>Select All</button>
                                <button className="text-[10px] uppercase font-bold text-muted-foreground hover:underline" onClick={() => setSelectedCategories([])}>Clear</button>
                            </div>
                        </div>

                        {/* Target Cameras Selection */}
                        <div className="flex flex-col h-full overflow-hidden">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Target Cameras</span>
                            <div className="space-y-1.5 overflow-y-auto pr-2 bg-muted/20 p-2 rounded-lg border border-border/50">
                                {cameras.filter(c => c.id !== editingId).map(cam => (
                                    <div
                                        key={cam.id}
                                        className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${copyTargets.includes(cam.id) ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                                        onClick={() => {
                                            if (copyTargets.includes(cam.id)) {
                                                setCopyTargets(copyTargets.filter(id => id !== cam.id));
                                            } else {
                                                setCopyTargets([...copyTargets, cam.id]);
                                            }
                                        }}
                                    >
                                        <div className={`w-4 h-4 mr-3 rounded border transition-colors flex items-center justify-center ${copyTargets.includes(cam.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                                            {copyTargets.includes(cam.id) && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium leading-none mb-1">{cam.name}</span>
                                            <span className="text-[10px] opacity-70 leading-none">{cam.location || 'No location'}</span>
                                        </div>
                                    </div>
                                ))}
                                {cameras.filter(c => c.id !== editingId).length === 0 && (
                                    <p className="text-xs text-center py-8 text-muted-foreground italic">No other cameras available.</p>
                                )}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button className="text-[10px] uppercase font-bold text-blue-600 hover:underline" onClick={() => setCopyTargets(cameras.filter(c => c.id !== editingId).map(c => c.id))}>Select All</button>
                                <button className="text-[10px] uppercase font-bold text-muted-foreground hover:underline" onClick={() => setCopyTargets([])}>Clear</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-border">
                        <Button
                            variant="ghost"
                            onClick={() => { setShowCopyModal(false); setCopyTargets([]); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCopy}
                            disabled={copyTargets.length === 0 || selectedCategories.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
                        >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy to {copyTargets.length} Cameras
                        </Button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};
