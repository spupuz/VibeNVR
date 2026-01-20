import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Filter, Play, Image as ImageIcon, Trash2, Download, Video, Camera, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';

// Vertical Hour Timeline Component with motion indicators
const HourTimeline = ({ events, onHourClick, selectedHour }) => {
    const hours = Array.from({ length: 24 }, (_, i) => 23 - i); // Newest at top

    // Count events per hour
    const eventsByHour = useMemo(() => {
        const counts = {};
        events.forEach(event => {
            const hour = new Date(event.timestamp_start).getHours();
            counts[hour] = (counts[hour] || 0) + 1;
        });
        return counts;
    }, [events]);

    const maxEvents = Math.max(...Object.values(eventsByHour), 1);
    const currentHour = new Date().getHours();

    return (
        <div className="w-16 flex-shrink-0 flex flex-col h-full">
            <div className="text-[9px] text-muted-foreground mb-1 font-medium text-center">24h</div>
            <div className="flex-1 flex flex-col space-y-0.5 overflow-hidden">
                {hours.map(hour => {
                    const count = eventsByHour[hour] || 0;
                    const width = count > 0 ? Math.max((count / maxEvents) * 100, 20) : 0;
                    const isSelected = selectedHour === hour;
                    const isCurrent = hour === currentHour;

                    return (
                        <div
                            key={hour}
                            className={`flex items-center cursor-pointer group h-full min-h-[12px] ${isCurrent ? 'bg-primary/5' : ''}`}
                            onClick={() => onHourClick(hour)}
                        >
                            <span className={`text-[8px] w-5 text-right mr-1 ${isCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                {hour.toString().padStart(2, '0')}
                            </span>
                            <div className="flex-1 h-2 bg-muted/20 rounded-r relative">
                                {count > 0 && (
                                    <div
                                        className={`absolute left-0 top-0 h-full rounded-r transition-all ${isSelected ? 'bg-red-500' : 'bg-red-400/70 group-hover:bg-red-500'
                                            }`}
                                        style={{ width: `${width}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const EventCard = ({ event, onClick, cameraName, isSelected, getMediaUrl, onDelete }) => {
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
            <div className="w-32 h-20 bg-black/10 flex-shrink-0 relative overflow-hidden">
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
                        <span className="text-xs font-semibold truncate">{cameraName}</span>
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
                    <div className="flex space-x-1">
                        {/* Duration Badge */}
                        {event.timestamp_end && (
                            <div className="text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center">
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
                            <div className="text-[10px] font-mono text-primary/80 bg-primary/5 px-1.5 py-0.5 rounded">
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

const API_BASE = `/api`;

export const Timeline = () => {
    const { token, user } = useAuth();
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [cameraMap, setCameraMap] = useState({});
    const [searchParams, setSearchParams] = useSearchParams();
    const [cameras, setCameras] = useState([]);
    const [selectedCameraFilter, setSelectedCameraFilter] = useState('all');
    const [selectedHour, setSelectedHour] = useState(null);
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all'); // all, video, snapshot
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
    const { showToast } = useToast();
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

    const cameraId = searchParams.get('camera');
    const type = searchParams.get('type');
    const urlDate = searchParams.get('date');
    const eventId = searchParams.get('event_id');

    useEffect(() => {
        if (urlDate) setSelectedDate(urlDate);
    }, [urlDate]);

    useEffect(() => {
        const fetchEvents = () => {
            let url = `${API_BASE}/events`;
            const params = new URLSearchParams();
            params.append('limit', '1000'); // Increased limit to see more history
            if (cameraId) params.append('camera_id', cameraId);
            if (type) params.append('type', type);
            if (selectedDate) params.append('date', selectedDate);

            if (Array.from(params).length > 0) {
                url += `?${params.toString()}`;
            }

            fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    console.log(`Fetched ${data.length} events`);
                    setEvents(data);

                    // Auto-select event if ID is in URL
                    if (eventId) {
                        const targetEvent = data.find(e => e.id === parseInt(eventId));
                        if (targetEvent) {
                            setSelectedEvent(targetEvent);
                            // Scroll to event list entry if possible
                            setTimeout(() => {
                                const element = document.getElementById(`event-${targetEvent.id}`);
                                if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 500);
                        }
                    }
                })
                .catch(err => console.error(err));
        };

        const fetchCameras = () => {
            fetch(`${API_BASE}/cameras`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    setCameras(data);
                    const map = data.reduce((acc, cam) => ({ ...acc, [cam.id]: cam.name }), {});
                    setCameraMap(map);
                })
                .catch(err => console.error(err));
        };

        if (token) {
            fetchEvents();
            fetchCameras();

            // Auto-refresh every 30 seconds
            const timer = setInterval(fetchEvents, 30000);
            return () => clearInterval(timer);
        }
    }, [cameraId, type, selectedDate, token]);

    const getCameraName = (id) => cameraMap[id] || `Camera ${id}`;

    const getMediaUrl = (path) => {
        if (!path) return '';
        let relative = path;
        if (relative.startsWith('/var/lib/motion/')) {
            relative = relative.replace('/var/lib/motion/', '');
        } else if (relative.startsWith('/var/lib/vibe/recordings/')) {
            relative = relative.replace('/var/lib/vibe/recordings/', '');
        }
        // Append token for authentication
        return `${API_BASE}/media/${relative}?token=${token}`;
    };

    const handleDelete = async (id) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Event',
            message: 'Are you sure you want to delete this event? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/events/${id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        setEvents(prev => prev.filter(e => e.id !== id));
                        if (selectedEvent?.id === id) setSelectedEvent(null);
                        showToast('Event deleted successfully', 'success');
                    } else {
                        showToast('Failed to delete event', 'error');
                    }
                } catch (err) {
                    showToast('Error deleting event: ' + err.message, 'error');
                }
                setConfirmConfig({ isOpen: false });
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    // Filter events by selected hour AND camera
    const filteredEvents = useMemo(() => {
        let results = events;

        if (selectedCameraFilter !== 'all') {
            results = results.filter(e => e.camera_id === parseInt(selectedCameraFilter));
        }

        if (selectedHour !== null) {
            results = results.filter(e => new Date(e.timestamp_start).getHours() === selectedHour);
        }

        if (selectedTypeFilter !== 'all') {
            results = results.filter(e => e.type === selectedTypeFilter);
        }

        return results;
    }, [events, selectedHour, selectedCameraFilter, selectedTypeFilter]);

    // Group events by date
    const groupedEvents = useMemo(() => {
        return filteredEvents.reduce((acc, event) => {
            const dateKey = new Date(event.timestamp_start).toLocaleDateString();
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(event);
            return acc;
        }, {});
    }, [filteredEvents]);

    const videoRef = React.useRef(null);
    const [autoplayNext, setAutoplayNext] = useState(() => {
        const saved = localStorage.getItem('vibe_autoplay_next');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [playbackSpeed2x, setPlaybackSpeed2x] = useState(() => {
        const saved = localStorage.getItem('vibe_playback_speed_2x');
        return saved !== null ? JSON.parse(saved) : false;
    });

    useEffect(() => {
        localStorage.setItem('vibe_autoplay_next', JSON.stringify(autoplayNext));
    }, [autoplayNext]);

    const [autoplayDirection, setAutoplayDirection] = useState(() => {
        const saved = localStorage.getItem('vibe_autoplay_direction');
        return saved !== null ? saved : 'desc'; // 'desc' = Newest -> Oldest (default)
    });

    useEffect(() => {
        localStorage.setItem('vibe_autoplay_direction', autoplayDirection);
    }, [autoplayDirection]);

    useEffect(() => {
        localStorage.setItem('vibe_playback_speed_2x', JSON.stringify(playbackSpeed2x));
    }, [playbackSpeed2x]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed2x ? 2.0 : 1.0;
        }
    }, [playbackSpeed2x, selectedEvent]);

    const goToNextEvent = useCallback(() => {
        if (!selectedEvent) return;

        // Flatten grouped events to get a linear list
        const allEvents = filteredEvents;
        const currentIndex = allEvents.findIndex(e => e.id === selectedEvent.id);

        if (currentIndex === -1) return;

        let nextIndex = -1;

        if (autoplayDirection === 'desc') {
            // Newest -> Oldest (Forward in array items, assuming list is Newest first)
            if (currentIndex < allEvents.length - 1) {
                nextIndex = currentIndex + 1;
            }
        } else {
            // Oldest -> Newest (Backward in array items)
            if (currentIndex > 0) {
                nextIndex = currentIndex - 1;
            }
        }

        if (nextIndex !== -1) {
            setSelectedEvent(allEvents[nextIndex]);
        }
    }, [autoplayDirection, selectedEvent, filteredEvents]);

    const handleVideoEnded = () => {
        if (autoplayNext) {
            goToNextEvent();
        }
    };

    // Auto-advance for images/snapshots
    useEffect(() => {
        let timer;
        if (autoplayNext && selectedEvent && selectedEvent.type === 'snapshot') {
            timer = setTimeout(() => {
                goToNextEvent();
            }, 5000);
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [autoplayNext, selectedEvent, goToNextEvent]);

    return (
        <div className="min-h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4">
            {/* Mobile: Sticky Video Player at Top */}
            {selectedEvent && (
                <div className="lg:hidden sticky top-0 z-20 bg-card border border-border rounded-xl p-3 flex flex-col">
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
                                onLoadedMetadata={(e) => e.target.playbackRate = playbackSpeed2x ? 2.0 : 1.0}
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
                            <button
                                onClick={() => setPlaybackSpeed2x(!playbackSpeed2x)}
                                className={`absolute top-2 right-2 px-2.5 py-1 rounded-md text-xs font-black backdrop-blur-md transition-all shadow-lg active:scale-90 ${playbackSpeed2x
                                    ? 'bg-primary text-white scale-110'
                                    : 'bg-black/40 text-white/90 border border-white/20'
                                    }`}
                            >
                                2x
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Left: Event List */}
            <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mb-4 p-1">
                    {/* ... (Previous filters remain unchanged) ... */}
                    <div className="relative">
                        <select
                            className="appearance-none pl-3 pr-8 py-2 bg-card border border-border rounded-xl text-sm min-w-[140px] focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:border-primary/50"
                            value={selectedCameraFilter}
                            onChange={(e) => {
                                setSelectedCameraFilter(e.target.value);
                                const newParams = new URLSearchParams(searchParams);
                                if (e.target.value === 'all') newParams.delete('camera');
                                else newParams.set('camera', e.target.value);
                                setSearchParams(newParams);
                            }}
                        >
                            <option value="all">All Cameras</option>
                            {cameras.map(cam => (
                                <option key={cam.id} value={cam.id}>{cam.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                            <Filter className="w-3.5 h-3.5" />
                        </div>
                    </div>

                    <div className="relative">
                        <select
                            className="appearance-none pl-3 pr-8 py-2 bg-card border border-border rounded-xl text-sm min-w-[120px] focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:border-primary/50"
                            value={selectedTypeFilter}
                            onChange={(e) => {
                                setSelectedTypeFilter(e.target.value);
                                const newParams = new URLSearchParams(searchParams);
                                if (e.target.value === 'all') newParams.delete('type');
                                else newParams.set('type', e.target.value);
                                setSearchParams(newParams);
                            }}
                        >
                            <option value="all">All Media</option>
                            <option value="video">Videos</option>
                            <option value="snapshot">Snapshots</option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                            {selectedTypeFilter === 'video' ? <Video className="w-3.5 h-3.5" /> : selectedTypeFilter === 'snapshot' ? <ImageIcon className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </div>
                    </div>

                    <div className="relative flex items-center">
                        <input
                            type="date"
                            className="pl-9 pr-3 py-2 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all hover:border-primary/50"
                            value={selectedDate}
                            onChange={(e) => {
                                setSelectedDate(e.target.value);
                                const newParams = new URLSearchParams(searchParams);
                                newParams.set('date', e.target.value);
                                setSearchParams(newParams);
                            }}
                        />
                        <Calendar className="absolute left-3 w-4 h-4 text-primary" />
                    </div>

                    <button
                        onClick={() => {
                            const today = new Date().toLocaleDateString('en-CA');
                            setSelectedDate(today);
                            setSelectedHour(null);
                            setSelectedCameraFilter('all');
                            setSelectedTypeFilter('all');
                            setSearchParams({});
                        }}
                        className={`flex items-center space-x-1.5 px-3 py-2 border rounded-xl text-sm transition-all
                            ${selectedDate === new Date().toLocaleDateString('en-CA') && selectedCameraFilter === 'all' && selectedTypeFilter === 'all'
                                ? 'bg-primary/10 border-primary/20 text-primary font-medium'
                                : 'bg-card border-border hover:bg-accent text-muted-foreground'
                            }`}
                    >
                        <span>Reset</span>
                    </button>

                    {selectedHour !== null && (
                        <button
                            onClick={() => setSelectedHour(null)}
                            className="px-3 py-2 text-sm bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                        >
                            <span className="font-bold">{selectedHour}:00</span>
                            <span className="opacity-70">✕</span>
                        </button>
                    )}
                </div>

                {/* Events area with vertical timeline */}
                <div className="flex-1 flex gap-2 min-h-0">
                    <HourTimeline
                        events={events}
                        onHourClick={(h) => setSelectedHour(selectedHour === h ? null : h)}
                        selectedHour={selectedHour}
                    />

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {filteredEvents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <Calendar className="w-10 h-10 mb-3 opacity-30" />
                                <p className="text-sm">No events found</p>
                            </div>
                        ) : (
                            Object.entries(groupedEvents).map(([date, dateEvents]) => (
                                <div key={date}>
                                    <div className="sticky top-0 bg-background/90 backdrop-blur-sm py-1.5 mb-1 z-10">
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">{date}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {dateEvents.map(event => (
                                            <EventCard
                                                key={event.id}
                                                event={event}
                                                onClick={setSelectedEvent}
                                                cameraName={getCameraName(event.camera_id)}
                                                isSelected={selectedEvent?.id === event.id}
                                                getMediaUrl={getMediaUrl}
                                                onDelete={handleDelete}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Preview Panel - Hidden on mobile, shown on desktop */}
            <div className="hidden lg:flex flex-1 bg-card border border-border rounded-xl p-4 flex-col min-h-0">
                {selectedEvent ? (
                    <>
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="text-lg font-bold">Event Details</h3>
                                <p className="text-xs text-muted-foreground">
                                    {getCameraName(selectedEvent.camera_id)} • {new Date(selectedEvent.timestamp_start).toLocaleString()}
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
                                        id="autoplayNext"
                                        checked={autoplayNext}
                                        onChange={(e) => setAutoplayNext(e.target.checked)}
                                        className="rounded border-gray-400 text-primary focus:ring-primary"
                                    />
                                    <label htmlFor="autoplayNext" className="text-xs font-medium cursor-pointer select-none">Auto-next</label>

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

                                {/* Speed Toggle */}
                                {selectedEvent.type === 'video' && (
                                    <button
                                        onClick={() => setPlaybackSpeed2x(!playbackSpeed2x)}
                                        className={`px-2.5 py-1 rounded-md text-xs font-black transition-all shadow-sm ${playbackSpeed2x
                                            ? 'bg-primary text-white scale-110 shadow-primary/20'
                                            : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
                                        title="Toggle 2x Speed"
                                    >
                                        2x
                                    </button>
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
                                    onLoadedMetadata={(e) => e.target.playbackRate = playbackSpeed2x ? 2.0 : 1.0}
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
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <Play className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-sm">Select an event to preview</p>
                    </div>
                )}
            </div>
            <ConfirmModal {...confirmConfig} />
        </div>
    );
};
