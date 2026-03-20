import React, { useState, useEffect } from 'react';
import { Download, Trash2, Clock, RotateCcw, ShieldCheck, FileJson, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

export const BackupManager = () => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    const fetchBackups = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/settings/backup/list', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setBackups(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch backups', err);
            showToast('Failed to load backup list', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchBackups();
    }, [token]);

    const handleBackupNow = async () => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/backup/run', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('Manual backup created successfully', 'success');
                fetchBackups();
            } else {
                showToast('Failed to trigger backup', 'error');
            }
        } catch (err) {
            showToast('Backup error: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = (filename) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Backup',
            message: `Are you sure you want to delete ${filename}? This action cannot be undone.`,
            confirmText: 'Delete',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                try {
                    const res = await fetch(`/api/settings/backup/${filename}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        showToast('Backup deleted successfully', 'success');
                        fetchBackups();
                    } else {
                        const err = await res.json();
                        showToast('Failed to delete backup: ' + (err.detail || 'Unknown error'), 'error');
                    }
                } catch (err) {
                    showToast('Delete error: ' + err.message, 'error');
                }
            }
        });
    };

    const handleRestore = (filename) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Restore Backup',
            message: `Are you sure you want to restore ${filename}? The system will overwrite current settings and may restart.`,
            confirmText: 'Restore Now',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                setActionLoading(true);
                try {
                    const res = await fetch(`/api/settings/backup/restore-file/${filename}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        showToast('System restoration successful!', 'success');
                        // Small delay before reload to let backend settle
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        const err = await res.json();
                        showToast('Failed to restore backup: ' + (err.detail || 'Unknown error'), 'error');
                    }
                } catch (err) {
                    showToast('Restore error: ' + err.message, 'error');
                } finally {
                    setActionLoading(false);
                }
            }
        });
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
                <div className="flex-1 min-w-0 overflow-hidden">
                    <h3 className="text-lg font-medium text-foreground flex items-center gap-2 truncate">
                        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                        <span className="truncate">Backup Management</span>
                    </h3>
                    <p className="text-sm text-muted-foreground truncate opacity-70">System snapshots and manual backups.</p>
                </div>
                <Button 
                    onClick={handleBackupNow} 
                    disabled={actionLoading}
                    variant="primary"
                    className="w-full sm:w-auto flex items-center justify-center gap-3 py-4 sm:py-3 min-h-[48px] sm:min-h-[44px] font-bold text-base shadow-sm"
                >
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-6 h-6" />}
                    Backup NOW
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : backups.length === 0 ? (
                <div className="text-center py-12 bg-muted/5 rounded-2xl border border-dashed border-border/40">
                    <FileJson className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground/60 text-sm">No backups found on server.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-hidden rounded-xl border border-border/50 bg-card/30">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border/50">
                                <tr>
                                    <th className="px-5 py-4">Filename</th>
                                    <th className="px-5 py-4 text-center">Type</th>
                                    <th className="px-5 py-4">Size</th>
                                    <th className="px-5 py-4">Created</th>
                                    <th className="px-5 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {backups.map((b) => (
                                    <tr key={b.filename} className="hover:bg-muted/30 transition-colors group">
                                        <td className="px-5 py-4 font-mono text-primary text-xs">
                                            {b.filename}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                                                b.filename.includes('_manual_') 
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                                                    : 'bg-primary/10 text-primary border-primary/20'
                                            }`}>
                                                {b.filename.includes('_manual_') ? 'Manual' : 'Auto'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-foreground/80 whitespace-nowrap">
                                            {formatSize(b.size)}
                                        </td>
                                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Clock className="w-4 h-4 opacity-50" />
                                                {formatDate(b.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleRestore(b.filename)}
                                                    className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                                                    title="Restore"
                                                >
                                                    <RotateCcw className="w-5 h-5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(b.filename)}
                                                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile View Cards */}
                    <div className="md:hidden space-y-4">
                        {backups.map((b) => (
                            <div key={b.filename} className="bg-card border border-border/70 p-5 rounded-2xl shadow-sm space-y-5">
                                <div className="space-y-3 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <FileJson className="w-4 h-4 text-primary shrink-0" />
                                        <p className="text-xs font-bold font-mono text-primary truncate max-w-full" title={b.filename}>
                                            {b.filename}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                                            b.filename.includes('_manual_') 
                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                                                : 'bg-primary/10 text-primary border-primary/20'
                                        }`}>
                                            {b.filename.includes('_manual_') ? 'Manual' : 'Auto'}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground">{formatSize(b.size)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-border/40 gap-4">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium opacity-80">
                                        <Clock className="w-4 h-4 opacity-50" />
                                        <span className="whitespace-nowrap">{formatDate(b.created_at)}</span>
                                    </div>
                                    <div className="flex gap-3 shrink-0">
                                        <button 
                                            onClick={() => handleRestore(b.filename)}
                                            className="p-3 text-emerald-500 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center min-h-[44px] min-w-[44px] active:scale-95 transition-all"
                                            title="Restore"
                                        >
                                            <RotateCcw className="w-5 h-5" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(b.filename)}
                                            className="p-3 text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center justify-center min-h-[44px] min-w-[44px] active:scale-95 transition-all"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ConfirmModal 
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmText={confirmConfig.confirmText}
                variant={confirmConfig.confirmVariant}
            />
        </div>
    );
};
