import React from 'react';
import { X, Download, Trash2, Play, HardDrive } from 'lucide-react';

/**
 * Event Preview and Video Player Component
 * @param {Object} props
 * @param {Object} props.selectedEvent - Currently focused event
 * @param {Function} props.getCameraName - Resolver for camera display names
 * @param {Function} props.getCamera - Resolver for camera data
 * @param {Function} props.getMediaUrl - Resolver for media URLs
 * @param {Function} props.setSelectedEvent - Handler for closing the preview
 * @param {Boolean} props.autoplayNext - Autoplay state
 * @param {Function} props.setAutoplayNext - Toggle autoplay next
 * @param {String} props.autoplayDirection - Playback direction (asc/desc)
 * @param {Function} props.setAutoplayDirection - Change playback direction
 * @param {Number} props.playbackSpeed - Current playback speed multiplier
 * @param {Function} props.setPlaybackSpeed - Change playback speed
 * @param {Function} props.handleVideoEnded - Triggered on video end for autoplay
 * @param {Function} props.handleDelete - Handler for event deletion
 * @param {React.RefObject} props.videoRef - Reference to the HTML Video element
 * @param {Object} props.user - Current user object
 * @param {Boolean} props.isMobile - Whether to render the mobile version
 */
export const EventPreview = ({
    selectedEvent,
    getCameraName,
    getCamera,
    getMediaUrl,
    setSelectedEvent,
    autoplayNext,
    setAutoplayNext,
    autoplayDirection,
    setAutoplayDirection,
    playbackSpeed,
    setPlaybackSpeed,
    handleVideoEnded,
    handleDelete,
    videoRef,
    user,
    isMobile = false
}) => {
    if (!selectedEvent) {
        if (isMobile) return null;
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Play className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Select an event to preview</p>
            </div>
        );
    }

    const camera = getCamera(selectedEvent.camera_id);

    if (isMobile) {
        return (
            <div className="lg:hidden sticky top-0 z-30 bg-card border border-border rounded-xl p-3 flex flex-col shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{getCameraName(selectedEvent.camera_id)}</h3>
                        <p className="text-[10px] text-muted-foreground truncate">
                            {new Date(selectedEvent.timestamp_start).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* Mobile Auto-next */}
                        <label className="flex items-center space-x-1.5 px-2 py-1 bg-muted/50 rounded-lg cursor-pointer transition-all active:scale-95">
                            <input
                                type="checkbox"
                                checked={autoplayNext}
                                onChange={(e) => setAutoplayNext(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-400 text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-tighter">Auto-next</span>
                            {autoplayNext && (
                                <select
                                    value={autoplayDirection}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setAutoplayDirection(e.target.value);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="ml-1 h-3.5 text-[9px] bg-transparent border-none focus:ring-0 cursor-pointer text-muted-foreground hover:text-foreground p-0 pr-1 pl-1"
                                    title="Playback Order"
                                >
                                    <option value="desc">Newest → Oldest</option>
                                    <option value="asc">Oldest → Newest</option>
                                </select>
                            )}
                        </label>
                        <button
                            onClick={() => setSelectedEvent(null)}
                            className="p-1 hover:bg-accent rounded-lg text-muted-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    {selectedEvent.type === 'video' ? (
                        <video
                            ref={videoRef}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            src={getMediaUrl(selectedEvent.file_path)}
                            onEnded={handleVideoEnded}
                            onLoadedMetadata={(e) => e.target.playbackRate = playbackSpeed}
                        />
                    ) : (
                        <img
                            src={getMediaUrl(selectedEvent.file_path)}
                            alt="Event"
                            className="w-full h-full object-contain"
                        />
                    )}
                    {/* Mobile Speed Overlay */}
                    {selectedEvent.type === 'video' && (
                        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md backdrop-blur-md shadow-lg bg-black/40 border border-white/20 active:scale-90 transition-all">
                            <select
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                className="bg-transparent text-xs font-black text-white/90 border-none focus:ring-0 cursor-pointer p-0 text-center w-8 appearance-none"
                                title="Playback Speed"
                            >
                                <option value={1} className="text-black">1x</option>
                                <option value={2} className="text-black">2x</option>
                                <option value={3} className="text-black">3x</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="text-lg font-bold">Event Details</h3>
                    <p className="text-xs text-muted-foreground">
                        {getCameraName(selectedEvent.camera_id)} • {new Date(selectedEvent.timestamp_start).toLocaleString()}
                        {camera?.storage_profile && (
                            <span className="inline-flex items-center ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                                <HardDrive className="w-2.5 h-2.5 mr-1" />
                                {camera.storage_profile.name}
                            </span>
                        )}
                        {selectedEvent.file_size > 0 && ` • ${selectedEvent.file_size < 1024 * 1024
                            ? (selectedEvent.file_size / 1024).toFixed(1) + ' KB'
                            : (selectedEvent.file_size / (1024 * 1024)).toFixed(1) + ' MB'}`}
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    {/* Autoplay Toggle */}
                    <div className="flex items-center space-x-2 mr-2 bg-muted/30 px-2 py-1 rounded-lg">
                        <input
                            type="checkbox"
                            id="autoplayNextDesktop"
                            checked={autoplayNext}
                            onChange={(e) => setAutoplayNext(e.target.checked)}
                            className="rounded border-gray-400 text-primary focus:ring-primary"
                        />
                        <label htmlFor="autoplayNextDesktop" className="text-xs font-medium cursor-pointer select-none">Auto-next</label>
                        {autoplayNext && (
                            <select
                                value={autoplayDirection}
                                onChange={(e) => setAutoplayDirection(e.target.value)}
                                className="ml-1 h-5 text-[10px] bg-transparent border-none focus:ring-0 cursor-pointer text-muted-foreground hover:text-foreground p-0 pr-1 pl-1"
                                title="Playback Order"
                            >
                                <option value="desc">Newest → Oldest</option>
                                <option value="asc">Oldest → Newest</option>
                            </select>
                        )}
                    </div>

                    {/* Speed Selection */}
                    {selectedEvent.type === 'video' && (
                        <div className="flex items-center space-x-1 bg-muted/50 hover:bg-muted rounded-lg px-2 py-1 transition-colors border border-transparent hover:border-border">
                            <select
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                className="bg-transparent text-xs font-bold text-foreground border-none focus:ring-0 cursor-pointer p-0 text-center w-12 appearance-none"
                                title="Playback Speed"
                            >
                                <option value={1}>1x</option>
                                <option value={2}>2x</option>
                                <option value={3}>3x</option>
                            </select>
                        </div>
                    )}

                    <div className="w-px h-6 bg-border mx-1"></div>

                    <a
                        href={`/api/events/${selectedEvent.id}/download`}
                        download
                        className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Download className="w-4 h-4" />
                    </a>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => handleDelete(selectedEvent.id)}
                            className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center min-h-0">
                {selectedEvent.type === 'video' ? (
                    <video
                        ref={videoRef}
                        controls
                        autoPlay
                        className="max-w-full max-h-full object-contain"
                        src={getMediaUrl(selectedEvent.file_path)}
                        onEnded={handleVideoEnded}
                        onLoadedMetadata={(e) => e.target.playbackRate = playbackSpeed}
                    >
                        Your browser does not support video.
                    </video>
                ) : (
                    <img
                        src={getMediaUrl(selectedEvent.file_path)}
                        alt="Event"
                        className="max-w-full max-h-full object-contain"
                    />
                )}
            </div>

            <div className="mt-2 text-[10px] text-muted-foreground font-mono bg-muted/30 p-1.5 rounded truncate">
                {selectedEvent.file_path}
            </div>
        </>
    );
};
