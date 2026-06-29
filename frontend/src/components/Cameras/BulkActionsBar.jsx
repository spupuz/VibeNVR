import React from 'react';
import { Trash2, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const BulkActionsBar = ({ selectedCameraIds, setSelectedCameraIds, handleBulkDelete, handleBulkExport }) => {
  const { t } = useTranslation();
    return (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[calc(100%-2rem)] sm:w-auto max-w-3xl">
            <div className="bg-card/95 backdrop-blur-md border border-primary/20 shadow-2xl rounded-2xl p-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-foreground">
                <div className="flex-1 w-full flex sm:block justify-between items-center text-center sm:text-left">
                    <p className="font-bold text-sm">
                        {selectedCameraIds.length} <span className="hidden sm:inline">Camera(s) selected</span><span className="sm:hidden">selected</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider hidden sm:block">{t('cameras.bulk_actions', 'Bulk Actions')}</p>
                    <button
                        onClick={() => setSelectedCameraIds([])}
                        className="sm:hidden px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 rounded-lg transition-colors"
                        aria-label="Clear"
                    >
                        Clear
                    </button>
                </div>
                <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setSelectedCameraIds([])}
                        className="hidden sm:block px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 rounded-lg transition-colors"
                        aria-label="Clear"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handleBulkExport}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center shadow-lg shadow-green-500/20 active:scale-95 whitespace-nowrap"
                        aria-label="Export Selected"
                    >
                        <Download className="w-3.5 h-3.5 sm:mr-1.5 mr-1" />
                        <span className="hidden sm:inline">Export Selected</span>
                        <span className="sm:hidden">Export</span>
                    </button>
                    <button
                        onClick={handleBulkDelete}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-95 whitespace-nowrap"
                        aria-label="Delete Selected"
                    >
                        <Trash2 className="w-3.5 h-3.5 sm:mr-1.5 mr-1" />
                        <span className="hidden sm:inline">Delete Selected</span>
                        <span className="sm:hidden">Delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
