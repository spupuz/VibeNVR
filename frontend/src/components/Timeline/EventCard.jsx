import React, { useState } from 'react';
import { Video, Image as ImageIcon, Download, Trash2, Camera, HardDrive } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Individual Event Card Component
 * @param {Object} props
 * @param {Object} props.event - The event data
 * @param {Function} props.onClick - Click handler for opening the event
 * @param {Object} props.camera - Associated camera data
 * @param {Boolean} props.isSelected - Whether this event is currently focused
 * @param {Boolean} props.isMultiSelected - Whether this event is part of a bulk selection
 * @param {Function} props.onToggleSelect - Handler for toggling selection (supports shiftKey)
 * @param {Function} props.getMediaUrl - Resolver for media URLs
 * @param {Function} props.onDelete - Handler for single event deletion
 */
export const EventCard = ({ event, onClick, camera, isSelected, isMultiSelected, onToggleSelect, getMediaUrl, onDelete }) => {
    const { user } = useAuth();
    const [imgError, setImgError] = useState(false);
    const time = new Date(event.timestamp_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(event.timestamp_start).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
        <div
            id={`event-${event.id}`}
            className={`flex items-stretch bg-card border rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg group
                ${isSelected ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-primary/50'}
            `}
            onClick={() => onClick(event)}
        >
            {/* Thumbnail */}
            <div className="w-24 sm:w-32 h-20 bg-black/10 flex-shrink-0 relative overflow-hidden">
                {event.thumbnail_path && !imgError ? (
                    <img
                        src={getMediaUrl(event.thumbnail_path)}
                        loading="lazy"
                        alt="Thumbnail"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={() => setImgError(true)}
                    />
                ) : event.type === 'snapshot' && !imgError ? (
                    <img
                        src={getMediaUrl(event.file_path)}
                        loading="lazy"
                        alt="Event"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted">
                        {event.type === 'video' ? <Video className="w-8 h-8 opacity-50" /> : <ImageIcon className="w-8 h-8 opacity-50" />}
                    </div>
                )}

                {/* Selection Checkbox (Visible on hover or if multi-selected for Admins only) */}
                {user?.role === 'admin' && (
                    <div 
                        className={`absolute top-2 left-2 z-20 transition-all cursor-pointer ${isMultiSelected ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect(event.id, e.shiftKey);
                        }}
                    >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                            isMultiSelected 
                            ? 'bg-primary border-primary text-primary-foreground shadow-sm' 
                            : 'bg-black/20 border-white/50 hover:border-white'
                        }`}>
                            {isMultiSelected && <div className="w-2.5 h-2.5 bg-current rounded-sm" />}
                        </div>
                    </div>
                )}

                {/* Overlaid Actions (Visible on Hover) */}
                <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-90 transition-opacity z-10">
                    {/* Download */}
                    <a
                        href={`/api/events/${event.id}/download`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 bg-black/50 hover:bg-black/70 text-white rounded backdrop-blur-sm transition-colors"
                        title="Download"
                    >
                        <Download className="w-3 h-3" />
                    </a>

                    {/* Delete */}
                    {user?.role === 'admin' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(event.id);
                            }}
                            className="p-1 bg-black/50 hover:bg-red-500/80 text-white rounded backdrop-blur-sm transition-colors"
                            title="Delete"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Type badge */}
                <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase
                ${event.type === 'video' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'}
            `}>
                    {event.type === 'video' ? 'Vid' : 'Img'}
                </div>

                {/* Motion indicator */}
                {event.event_type === 'motion' && (
                    <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
                <div>
                    <div className="flex items-center space-x-1 mb-0.5">
                        <Camera className="w-3 h-3 text-primary" />
                        <span className="text-xs font-semibold truncate">{camera?.name || `Camera ${event.camera_id}`}</span>
                        {camera?.storage_profile && (
                            <div className="flex items-center ml-1 text-[8px] bg-primary/10 text-primary px-1 rounded-sm border border-primary/20" title={`Stored on: ${camera.storage_profile.name}`}>
                                <HardDrive className="w-2 h-2 mr-0.5" />
                                <span className="uppercase font-bold">{camera.storage_profile.name}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {event.file_path?.split('/').pop()}
                    </p>
                </div>
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground">{time}</span>
                        <span className="text-[8px] text-muted-foreground/50">{date}</span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 pl-1">
                        {/* Duration Badge */}
                        {event.timestamp_end && (
                            <div className="text-[9px] sm:text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1 py-0.5 rounded flex items-center">
                                {(() => {
                                    const start = new Date(event.timestamp_start);
                                    const end = new Date(event.timestamp_end);
                                    const diff = Math.floor((end - start) / 1000);
                                    if (diff < 0) return '';
                                    const m = Math.floor(diff / 60);
                                    const s = diff % 60;
                                    return `${m}:${s.toString().padStart(2, '0')}`;
                                })()}
                            </div>
                        )}
                        {event.file_size > 0 && (
                            <div className="text-[9px] sm:text-[10px] font-mono text-primary/80 bg-primary/5 px-1 py-0.5 rounded">
                                {event.file_size < 1024 * 1024
                                    ? `${(event.file_size / 1024).toFixed(1)} KB`
                                    : `${(event.file_size / (1024 * 1024)).toFixed(1)} MB`
                                }
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
