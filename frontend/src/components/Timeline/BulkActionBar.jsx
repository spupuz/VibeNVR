import React from 'react';
import { X, HardDrive, Trash2 } from 'lucide-react';

/**
 * Floating Action Bar for Bulk Event Operations
 * @param {Object} props
 * @param {Set} props.selectedIds - Set of IDs of currently selected events
 * @param {Array} props.filteredEvents - Current list of filtered events
 * @param {Function} props.handleSelectAll - Handler for toggling Select All
 * @param {Function} props.setSelectedIds - Handler for clearing selection
 * @param {Function} props.handleBulkDelete - Handler for bulk deletion
 * @param {Boolean} props.isBulkDeleting - Loading state for bulk delete action
 */
export const BulkActionBar = ({
    selectedIds,
    filteredEvents,
    handleSelectAll,
    setSelectedIds,
    handleBulkDelete,
    isBulkDeleting,
    user
}) => {
    if (selectedIds.size === 0 || user?.role !== 'admin') return null;

    return (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[95%] max-w-2xl px-2">
            <div className="bg-primary shadow-2xl shadow-primary/20 text-primary-foreground rounded-2xl px-2 py-1.5 sm:px-6 sm:py-3 flex items-center justify-between gap-1 sm:gap-6 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                    <div className="flex bg-white/20 rounded-lg px-2 py-1 items-center justify-center min-w-[28px]">
                        <span className="text-xs sm:text-xl font-black leading-none">{selectedIds.size}</span>
                    </div>
                    <div className="h-5 sm:h-8 w-px bg-white/20 hidden sm:block" />
                </div>
                
                <div className="flex-1 flex items-center justify-end gap-1 sm:gap-4">
                    <button
                        onClick={handleSelectAll}
                        className="px-1.5 py-1.5 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-1 sm:gap-1.5"
                    >
                        {selectedIds.size === filteredEvents.length ? (
                            <>
                                <X className="w-3.5 h-3.5" />
                                <span className="text-[10px] sm:text-sm font-semibold whitespace-nowrap">Deselect All</span>
                            </>
                        ) : (
                            <>
                                <HardDrive className="w-3.5 h-3.5 opacity-70" />
                                <span className="text-[10px] sm:text-sm font-semibold whitespace-nowrap">Select All</span>
                            </>
                        )}
                    </button>
                    
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        title="Cancel"
                        className="p-2 sm:px-3 sm:py-1.5 hover:bg-white/10 rounded-xl transition-colors"
                    >
                        <X className="w-4 h-4 sm:hidden" />
                        <span className="hidden sm:inline text-sm font-semibold">Cancel</span>
                    </button>
                    
                    {user?.role === 'admin' && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className={`flex-shrink-0 px-3 py-2 sm:px-4 sm:py-2 bg-white text-primary hover:bg-white/90 rounded-xl text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center gap-1.5 sm:gap-2 ${isBulkDeleting ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                        >
                            {isBulkDeleting ? (
                                <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            ) : (
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                            <span className="whitespace-nowrap">Delete {selectedIds.size}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
