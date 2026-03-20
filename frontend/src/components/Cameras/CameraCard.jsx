import React from 'react';
import { Camera, MapPin, HardDrive, Download, Edit, Trash2 } from 'lucide-react';
import { Toggle } from '../ui/FormControls';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export const CameraCard = ({ camera, onDelete, onEdit, onToggleActive, isSelected, onSelect }) => {
    const { user, token } = useAuth();
    const { showToast } = useToast();
    
    return (
        <div
            className={`bg-card border-2 rounded-xl flex flex-col hover:shadow-lg transition-all duration-300 group relative overflow-hidden
                ${!camera.is_active ? 'opacity-70 grayscale-[0.5]' : ''}
                ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-border'}
            `}
        >
            {/* Selection Checkbox */}
            {user?.role === 'admin' && (
                <div
                    className={`absolute top-4 left-4 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${isSelected ? 'bg-primary border-primary' : 'bg-background/80 border-border group-hover:border-primary/50'
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(camera.id);
                    }}
                >
                    {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
            )}

            <div className="p-6 flex-1">
                <div className="flex justify-between items-center mb-4">
                    <div className={`p-2 rounded-lg transition-colors ml-2 ${isSelected ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                        <Camera className="w-6 h-6" />
                    </div>
                    {user?.role === 'admin' && (
                        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                            <Toggle
                                checked={camera.is_active}
                                onChange={() => onToggleActive(camera)}
                                compact={true}
                            />
                        </div>
                    )}
                </div>

                <div className="mb-4">
                    <h3 className="font-semibold text-lg flex items-center flex-wrap gap-2">
                        <span className="mr-1">{camera.name}</span>
                        <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground border border-border whitespace-nowrap">
                            ID: {camera.id}
                        </span>
                    </h3>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate" title={camera.location}>{camera.location || 'Unknown Location'}</span>
                    </div>
                    {camera.storage_profile && (
                        <div className="flex items-center text-[10px] text-primary/70 mt-1 font-medium bg-primary/5 w-fit px-1.5 py-0.5 rounded border border-primary/10">
                            <HardDrive className="w-2.5 h-2.5 mr-1" />
                            <span>{camera.storage_profile.name}</span>
                        </div>
                    )}
                </div>

                {user?.role === 'admin' && (
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="truncate">
                            <span className="font-medium text-foreground">RTSP:</span> {(() => {
                                try {
                                    if (camera.rtsp_url && camera.rtsp_url.includes('@')) {
                                        const parts = camera.rtsp_url.split('@');
                                        const protocol = parts[0].split('://')[0] + '://';
                                        return protocol + parts[1];
                                    }
                                    return camera.rtsp_url;
                                } catch (e) {
                                    return camera.rtsp_url;
                                }
                            })()}
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-end p-4 bg-muted/10 border-t border-border space-x-2">
                {user?.role === 'admin' && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/cameras/${camera.id}/export`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;

                                        const disposition = res.headers.get('Content-Disposition');
                                        let filename = `vibenvr_camera_${camera.name.replace(' ', '_')}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
                                        if (disposition && disposition.includes('filename=')) {
                                            filename = disposition.split('filename=')[1].replace(/"/g, '');
                                        }
                                        a.download = filename;

                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                        showToast("Camera settings exported successfully", "success");
                                    } else {
                                        showToast("Failed to export settings", "error");
                                    }
                                } catch (e) {
                                    showToast("Export error: " + e.message, "error");
                                }
                            }}
                            className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40"
                            title="Export Camera Settings"
                        >
                            <Download className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(camera)}
                            className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                            title="Edit Camera"
                        >
                            <Edit className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(camera.id)}
                            className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                            title="Delete Camera"
                        >
                            <Trash2 className="w-5 h-5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};
