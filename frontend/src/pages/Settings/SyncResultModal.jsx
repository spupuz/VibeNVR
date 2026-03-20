import React from 'react';
import { HardDrive, X, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const SyncResultModal = ({
    isOpen,
    data,
    onClose
}) => {
    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
            <div className="relative bg-background border rounded-lg shadow-lg max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-blue-500" />
                        Recovery Complete
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {data.error ? (
                        <div className="p-4 bg-red-500/10 text-red-500 rounded-lg">
                            <p className="font-semibold">Error Occurred</p>
                            <p className="text-sm">{data.error}</p>
                        </div>
                    ) : (
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                <span className="font-medium">Recovered Recordings</span>
                                <span className="font-bold text-green-600 bg-green-100 px-2 py-1 rounded">{data.imported}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 border-b">
                                <span className="text-muted-foreground">Skipped (Already in DB)</span>
                                <span className="font-medium">{data.skipped}</span>
                            </div>

                            {(data.thumbnails_generated > 0) && (
                                <div className="flex justify-between items-center p-2 border-b">
                                    <span>Thumbnails Generated</span>
                                    <span className="font-medium text-blue-500">{data.thumbnails_generated}</span>
                                </div>
                            )}

                            {(data.corrupted_deleted > 0) && (
                                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mt-2">
                                    <div className="flex items-center gap-2 mb-1 text-amber-700 font-medium">
                                        <Trash2 className="w-3 h-3" />
                                        <span>Corrupted Files Removed</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-amber-600/80 pl-5">
                                        <span>Count: {data.corrupted_deleted}</span>
                                        <span> Freed: {data.corrupted_size_mb} MB</span>
                                    </div>
                                </div>
                            )}

                            {(data.orphaned_deleted > 0) && (
                                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 mt-2">
                                    <div className="flex items-center gap-2 mb-1 text-red-700 font-medium">
                                        <Trash2 className="w-3 h-3" />
                                        <span>Deleted Camera Files Cleaned</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-red-600/80 pl-5">
                                        <span>Count: {data.orphaned_deleted}</span>
                                        <span> Freed: {data.orphaned_size_mb} MB</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <Button
                        onClick={onClose}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};
