import React, { useState, useEffect } from 'react';
import { Camera, CheckSquare, Square, X, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTranslation } from 'react-i18next';

export const ImportSelectionModal = ({ showModal, onClose, onConfirm, cameras }) => {
    const { t } = useTranslation();
    const [selectedIndices, setSelectedIndices] = useState([]);

    useEffect(() => {
        if (showModal && cameras) {
            // Select all by default
            setSelectedIndices(cameras.map((_, idx) => idx));
        }
    }, [showModal, cameras]);

    if (!showModal) return null;

    const handleSelectAll = () => {
        setSelectedIndices(cameras.map((_, idx) => idx));
    };

    const handleDeselectAll = () => {
        setSelectedIndices([]);
    };

    const toggleSelection = (idx) => {
        setSelectedIndices(prev => 
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    const handleConfirm = () => {
        const selectedCameras = selectedIndices.map(idx => cameras[idx]);
        onConfirm(selectedCameras);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in p-4 sm:p-6">
            <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground flex items-center">
                            <Download className="w-6 h-6 mr-2 text-primary" />
                            {t('cameras.import_selection_title', 'Select Cameras to Import')}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('cameras.import_selection_desc', 'Choose which cameras you want to import from the file.')}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors" aria-label={t('common.close', 'Close')}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center shrink-0">
                    <div className="text-sm font-semibold">
                        {selectedIndices.length} / {cameras.length} {t('cameras.selected', 'Selected')}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSelectAll}>
                            {t('cameras.select_all', 'Select All')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                            {t('cameras.deselect_all', 'Deselect All')}
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {cameras.map((cam, idx) => {
                        const isSelected = selectedIndices.includes(idx);
                        return (
                            <div 
                                key={idx} 
                                onClick={() => toggleSelection(idx)}
                                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                                    isSelected ? 'bg-primary/5 border-primary shadow-sm' : 'bg-card border-border hover:bg-muted'
                                }`}
                            >
                                <div className="mr-4">
                                    {isSelected ? (
                                        <CheckSquare className="w-5 h-5 text-primary" />
                                    ) : (
                                        <Square className="w-5 h-5 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground flex items-center">
                                        <Camera className="w-4 h-4 mr-1.5 text-muted-foreground" />
                                        <span className="truncate">{cam.name || t('cameras.unknown', 'Unknown Camera')}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={cam.rtsp_url}>
                                        {cam.rtsp_url}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0 bg-muted/10 rounded-b-2xl">
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        disabled={selectedIndices.length === 0}
                    >
                        {t('cameras.import_selected', 'Import Selected')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
