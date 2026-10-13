import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, Trash2, Play, HardDrive, CloudOff, Film, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const getApiBase = () => window.__ACTIVE_NODE_ID ? `/api/federation/proxy/${window.__ACTIVE_NODE_ID}` : `/api`;

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
// ⚡ Bolt: Wrapped with React.memo to prevent expensive re-renders when parent Timeline state changes
export const EventPreview = React.memo(({
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
    const { t } = useTranslation();
    const { token } = useAuth();
    const [storageError, setStorageError] = useState(false);
    const [codecError, setCodecError] = useState(false);
    const [isTranscoding, setIsTranscoding] = useState(false);
    const [transcodeError, setTranscodeError] = useState(null);
    const [playbackSource, setPlaybackSource] = useState('');

    useEffect(() => {
        let isMounted = true;
        setStorageError(false);
        setCodecError(false);
        setIsTranscoding(false);
        setTranscodeError(null);

        if (selectedEvent) {
            const isMkv = selectedEvent.file_path?.toLowerCase().endsWith('.mkv');
            if (isMkv) {
                // Browsers cannot play MKV natively; route through the zero-CPU remux endpoint
                setPlaybackSource(`${getApiBase()}/events/${selectedEvent.id}/playback${token ? `?token=${encodeURIComponent(token)}` : ''}`);
            } else {
                setPlaybackSource(getMediaUrl(selectedEvent.file_path));
            }

            // Check if media is reachable (catches Circuit Breaker 404 instantly).
            // Use GET with Range to avoid FastAPI 405 Method Not Allowed on HEAD requests.
            const url = getMediaUrl(selectedEvent.file_path);
            fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-0' }, credentials: 'include' })
                .then(res => {
                    if (res.status === 404 && isMounted) {
                        setStorageError(true);
                    }
                })
                .catch(() => {
                    if (isMounted) setStorageError(true);
                });
        }

        return () => { isMounted = false; };
    }, [selectedEvent?.id, getMediaUrl, token]);

    const handleVideoError = useCallback(() => {
        if (storageError) return;
        setCodecError(true);
    }, [storageError]);

    const handleTranscode = useCallback(async () => {
        if (!selectedEvent) return;
        setIsTranscoding(true);
        setTranscodeError(null);
        try {
            const res = await fetch(`${getApiBase()}/events/${selectedEvent.id}/transcode`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                credentials: 'include'
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || t('timeline.transcode_failed', 'Transcoding failed. Please download the file to view.'));
            }
            const newUrl = `${getApiBase()}/events/${selectedEvent.id}/playback?transcode=true${token ? `&token=${encodeURIComponent(token)}` : ''}&t=${Date.now()}`;
            setPlaybackSource(newUrl);
            setCodecError(false);
        } catch (err) {
            setTranscodeError(err.message || t('timeline.transcode_failed', 'Transcoding failed. Please download the file to view.'));
        } finally {
            setIsTranscoding(false);
        }
    }, [selectedEvent, token, t]);

    if (!selectedEvent) {
        if (isMobile) return null;
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Play className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">{t('timeline.select_event', 'Select an event to preview')}</p>
            </div>
        );
    }

    const camera = getCamera(selectedEvent.camera_id);

    const renderPlayerContent = (isMobileLayout = false) => {
        if (storageError) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                    <CloudOff className={`${isMobileLayout ? 'w-10 h-10' : 'w-16 h-16'} opacity-50 mb-2`} />
                    <span className={`${isMobileLayout ? 'text-sm' : 'text-xl'} font-bold uppercase`}>{t('timeline.offline', 'Offline')}</span>
                    <span className={`${isMobileLayout ? 'text-xs' : 'text-sm'} mt-1`}>{t('timeline.media_unavailable', 'Media unavailable or remote storage is currently unreachable.')}</span>
                </div>
            );
        }

        if (codecError) {
            const isMkv = selectedEvent?.file_path?.toLowerCase().endsWith('.mkv');
            const isHevc = camera?.codec?.includes('hevc') || camera?.codec?.includes('h265');
            const downloadUrl = `${getApiBase()}/events/${selectedEvent.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;

            return (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 lg:p-6 text-center bg-zinc-950 text-muted-foreground overflow-y-auto">
                    <div className="p-2 lg:p-3 bg-amber-500/10 text-amber-400 rounded-full mb-2 border border-amber-500/20">
                        <Film className={`${isMobileLayout ? 'w-6 h-6' : 'w-8 h-8'}`} />
                    </div>

                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] lg:text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {isHevc ? 'H.265 / HEVC' : isMkv ? 'MKV Container' : t('timeline.unsupported_codec', 'Unsupported Codec')}
                        </span>
                        <span className="text-[10px] lg:text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {t('timeline.passthrough', 'Passthrough')}
                        </span>
                    </div>

                    <h4 className="text-xs lg:text-sm font-semibold text-foreground mt-0.5">
                        {t('timeline.codec_unsupported_title', 'Browser Playback Unsupported')}
                    </h4>

                    <p className="text-[10px] lg:text-xs text-muted-foreground max-w-sm mt-0.5 mb-2.5">
                        {t('timeline.codec_unsupported_desc', 'This video format cannot be decoded directly by your browser (H.265/HEVC or MKV container). The recording is intact on disk.')}
                    </p>

                    {transcodeError && (
                        <p className="text-[10px] lg:text-xs text-destructive mb-2 px-2 text-center">
                            {transcodeError}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-1.5 mb-2.5">
                        <button
                            type="button"
                            onClick={handleTranscode}
                            disabled={isTranscoding}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                            {isTranscoding ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>{t('timeline.transcoding_in_progress', 'Transcoding video with FFmpeg...')}</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>{t('timeline.transcode_playback', 'Transcode for Web Playback')}</span>
                                </>
                            )}
                        </button>

                        <a
                            href={downloadUrl}
                            download
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium rounded-lg transition-all border border-border"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>{t('timeline.download_original', 'Download Original File')}</span>
                        </a>
                    </div>

                    <div className="text-[9px] lg:text-[10px] text-muted-foreground/80 bg-muted/30 px-2 py-1 rounded-md max-w-xs border border-border/50 text-left">
                        <p>
                            💡 <strong className="text-foreground/90">{t('timeline.tip_label', 'Tip')}:</strong>{' '}
                            {t('timeline.transcode_tip', 'To play recordings immediately in any browser without transcoding, switch Recording Mode to Transcoded in Camera Settings.')}
                        </p>
                    </div>
                </div>
            );
        }

        if (selectedEvent.type === 'video') {
            return (
                <video
                    ref={videoRef}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                    src={playbackSource}
                    onEnded={handleVideoEnded}
                    onLoadedMetadata={(e) => { e.target.playbackRate = playbackSpeed; }}
                    onError={handleVideoError}
                >
                    {t('timeline.no_video_support', 'Your browser does not support video.')}
                </video>
            );
        }

        return (
            <img
                src={playbackSource || getMediaUrl(selectedEvent.file_path)}
                alt="Event"
                className="w-full h-full object-contain"
                onError={() => setStorageError(true)}
            />
        );
    };

    if (isMobile) {
        return (
            <div className="lg:hidden sticky top-0 z-30 bg-card border border-border rounded-xl p-3 flex flex-col shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{getCameraName(selectedEvent.camera_id)}</h3>
                        <p className="text-[10px] text-muted-foreground truncate">
                            {selectedEvent.parsed_locale_str || new Date(selectedEvent.timestamp_start).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* Mobile Auto-next */}
                        <label htmlFor="autoplayNextMobile" className="flex items-center space-x-1.5 px-2 py-1 bg-muted/50 rounded-lg cursor-pointer transition-all active:scale-95">
                            <input
                                id="autoplayNextMobile"
                                type="checkbox"
                                checked={autoplayNext}
                                onChange={(e) => setAutoplayNext(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-400 text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-tighter">{t('timeline.auto_next', 'Auto-next')}</span>
                            {autoplayNext && (
                                <select
                                    id="autoplayDirectionMobile"
                                    aria-label={t('timeline.playback_order', 'Playback Order')}
                                    value={autoplayDirection}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setAutoplayDirection(e.target.value);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="ml-1 h-3.5 text-[9px] bg-transparent border-none focus:ring-0 cursor-pointer text-muted-foreground hover:text-foreground p-0 pr-1 pl-1"
                                    title={t('timeline.playback_order', 'Playback Order')}
                                >
                                    <option value="desc" className="bg-card text-foreground">{t('timeline.newest_oldest', 'Newest → Oldest')}</option>
                                    <option value="asc" className="bg-card text-foreground">{t('timeline.oldest_newest', 'Oldest → Newest')}</option>
                                </select>
                            )}
                        </label>
                        <button
                            onClick={() => setSelectedEvent(null)}
                            className="p-1 hover:bg-accent rounded-lg text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            title={t('common.close', 'Close')}
                            aria-label={t('common.close', 'Close')}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    {renderPlayerContent(true)}
                    {/* Mobile Speed Overlay */}
                    {selectedEvent.type === 'video' && !codecError && !storageError && (
                        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md backdrop-blur-md shadow-lg bg-black/40 border border-white/20 active:scale-90 transition-all">
                            <select
                                aria-label={t('timeline.playback_speed', 'Playback Speed')}
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                className="bg-transparent text-xs font-black text-white/90 border-none focus:ring-0 cursor-pointer p-0 text-center w-8 appearance-none"
                                title={t('timeline.playback_speed', 'Playback Speed')}
                            >
                                <option value={1} className="!bg-card !text-foreground">{t('timeline.1x', '1x')}</option>
                                <option value={2} className="!bg-card !text-foreground">{t('timeline.2x', '2x')}</option>
                                <option value={3} className="!bg-card !text-foreground">{t('timeline.3x', '3x')}</option>
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
                    <h3 className="text-lg font-bold">{t('timeline.event_details', 'Event Details')}</h3>
                    <p className="text-xs text-muted-foreground">
                        {getCameraName(selectedEvent.camera_id)} • {selectedEvent.parsed_locale_str || new Date(selectedEvent.timestamp_start).toLocaleString()}
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
                        <label htmlFor="autoplayNextDesktop" className="text-xs font-medium cursor-pointer select-none">{t('timeline.auto_next', 'Auto-next')}</label>
                        {autoplayNext && (
                            <select
                                id="autoplayDirectionDesktop"
                                aria-label={t('timeline.playback_order', 'Playback Order')}
                                value={autoplayDirection}
                                onChange={(e) => setAutoplayDirection(e.target.value)}
                                className="ml-1 h-5 text-[10px] bg-transparent border-none focus:ring-0 cursor-pointer text-muted-foreground hover:text-foreground p-0 pr-1 pl-1"
                                title={t('timeline.playback_order', 'Playback Order')}
                            >
                                <option value="desc" className="bg-card text-foreground">{t('timeline.newest_oldest', 'Newest → Oldest')}</option>
                                <option value="asc" className="bg-card text-foreground">{t('timeline.oldest_newest', 'Oldest → Newest')}</option>
                            </select>
                        )}
                    </div>

                    {/* Speed Selection */}
                    {selectedEvent.type === 'video' && !codecError && !storageError && (
                        <div className="flex items-center space-x-1 bg-muted/50 hover:bg-muted rounded-lg px-2 py-1 transition-colors border border-transparent hover:border-border">
                            <select
                                aria-label={t('timeline.playback_speed', 'Playback Speed')}
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                className="bg-transparent text-xs font-bold text-foreground border-none focus:ring-0 cursor-pointer p-0 text-center w-12 appearance-none"
                                title={t('timeline.playback_speed', 'Playback Speed')}
                            >
                                <option value={1} className="!bg-card !text-foreground">{t('timeline.1x', '1x')}</option>
                                <option value={2} className="!bg-card !text-foreground">{t('timeline.2x', '2x')}</option>
                                <option value={3} className="!bg-card !text-foreground">{t('timeline.3x', '3x')}</option>
                            </select>
                        </div>
                    )}

                    <div className="w-px h-6 bg-border mx-1"></div>

                    <a
                        href={`${getApiBase()}/events/${selectedEvent.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`}
                        download
                        className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        title={t('common.download', 'Download')}
                        aria-label={t('common.download', 'Download')}
                    >
                        <Download className="w-4 h-4" />
                    </a>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => handleDelete(selectedEvent.id)}
                            className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                            title={t('common.delete', 'Delete')}
                            aria-label={t('common.delete', 'Delete')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center min-h-0 relative">
                {renderPlayerContent(false)}
            </div>

            <div className="mt-2 text-[10px] text-muted-foreground font-mono bg-muted/30 p-1.5 rounded truncate">
                {selectedEvent.file_path}
            </div>
        </>
    );
});
