import React from 'react';
import { Copy } from 'lucide-react';
import { Portal } from '../ui/Portal';
import { Button } from '../ui/Button';

export const CopySettingsModal = ({
    showCopyModal,
    setShowCopyModal,
    cameras,
    editingId,
    copyTargets,
    setCopyTargets,
    handleCopySettings
}) => {
    if (!showCopyModal) return null;

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] lg:pl-64 p-4">
                <div className="bg-card p-6 rounded-xl w-full max-w-md border border-border shadow-xl">
                    <h3 className="text-lg font-bold mb-2">Copy Settings</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Select cameras to overwrite with current settings. <br />
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">Warning: This will replace configuration for selected cameras.</span>
                    </p>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto mb-6 bg-muted/20 p-2 rounded-lg border border-border/50">
                        {cameras.filter(c => c.id !== editingId).map(cam => (
                            <div
                                key={cam.id}
                                className="flex items-center p-2 hover:bg-accent rounded cursor-pointer"
                                onClick={() => {
                                    if (copyTargets.includes(cam.id)) {
                                        setCopyTargets(copyTargets.filter(id => id !== cam.id));
                                    } else {
                                        setCopyTargets([...copyTargets, cam.id]);
                                    }
                                }}
                            >
                                <div className={`w-5 h-5 mr-3 rounded border-2 flex items-center justify-center transition-colors ${copyTargets.includes(cam.id)
                                    ? 'bg-primary border-primary'
                                    : 'border-gray-400 dark:border-gray-500'
                                    }`}>
                                    {copyTargets.includes(cam.id) && (
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <span className="font-medium">{cam.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{cam.resolution_width}x{cam.resolution_height}</span>
                            </div>
                        ))}
                        {cameras.filter(c => c.id !== editingId).length === 0 && (
                            <p className="text-sm text-center py-4 text-muted-foreground">No other cameras available.</p>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3">
                        <Button
                            variant="ghost"
                            onClick={() => { setShowCopyModal(false); setCopyTargets([]); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCopySettings}
                            disabled={copyTargets.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
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
