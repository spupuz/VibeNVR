import React from 'react';
import { Trash2, Upload, Activity } from 'lucide-react';

export const ProcessingOverlay = ({ isProcessing, processingMessage }) => {
    if (!isProcessing) return null;

    return (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[140] flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="bg-card border border-border p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm text-center">
                <div className="flex items-center justify-center space-x-6 mb-6">
                    <div className="p-3 bg-primary/10 rounded-2xl">
                        {processingMessage.title.includes('Delete') ? (
                            <Trash2 className="w-10 h-10 text-red-500" />
                        ) : (
                            <Upload className="w-10 h-10 text-primary" />
                        )}
                    </div>
                    <Activity className="w-12 h-12 text-primary animate-spin opacity-50" />
                </div>
                <h3 className="text-xl font-bold mb-2">{processingMessage.title}</h3>
                <p className="text-muted-foreground text-sm">
                    {processingMessage.text}
                </p>
            </div>
        </div>
    );
};
