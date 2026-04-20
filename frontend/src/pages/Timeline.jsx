import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Play } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';

// Modular Components
import { HourTimeline } from '../components/Timeline/HourTimeline';
import { EventCard } from '../components/Timeline/EventCard';
import { EventFilters } from '../components/Timeline/EventFilters';
import { BulkActionBar } from '../components/Timeline/BulkActionBar';
import { EventPreview } from '../components/Timeline/EventPreview';

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
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
    const { showToast } = useToast();
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobileView(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const cameraId = searchParams.get('camera');
    const type = searchParams.get('type');
    const urlDate = searchParams.get('date');
    const eventId = searchParams.get('event_id');

    const filteredEvents = useMemo(() => {
        let results = events;
        if (selectedCameraFilter !== 'all') results = results.filter(e => e.camera_id === parseInt(selectedCameraFilter));
        if (selectedHour !== null) results = results.filter(e => new Date(e.timestamp_start).getHours() === selectedHour);
        if (selectedTypeFilter !== 'all') results = results.filter(e => e.type === selectedTypeFilter);
        return results;
    }, [events, selectedHour, selectedCameraFilter, selectedTypeFilter]);

    useEffect(() => {
        if (urlDate) setSelectedDate(urlDate);
    }, [urlDate]);

    const fetchEvents = useCallback(() => {
        let url = `${API_BASE}/events`;
        const params = new URLSearchParams();
        params.append('limit', '1000');
        if (cameraId) params.append('camera_id', cameraId);
        if (type) params.append('type', type);
        if (selectedDate) params.append('date', selectedDate);

        if (Array.from(params).length > 0) url += `?${params.toString()}`;

        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                setEvents(data);
                if (eventId) {
                    const targetEvent = data.find(e => e.id === parseInt(eventId));
                    if (targetEvent) {
                        setSelectedEvent(targetEvent);
                        setTimeout(() => {
                            const element = document.getElementById(`event-${targetEvent.id}`);
                            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 500);
                    }
                }
            })
            .catch(err => console.error(err));
    }, [cameraId, type, selectedDate, token, eventId]);

    const fetchCameras = useCallback(() => {
        fetch(`${API_BASE}/cameras`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                setCameras(data);
                setCameraMap(data.reduce((acc, cam) => ({ ...acc, [cam.id]: cam }), {}));
            })
            .catch(err => console.error(err));
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchEvents();
            fetchCameras();
            const timer = setInterval(fetchEvents, 30000);
            return () => clearInterval(timer);
        }
    }, [fetchEvents, fetchCameras, token]);

    const getCamera = (id) => cameraMap[id];
    const getCameraName = (id) => cameraMap[id]?.name || `Camera ${id}`;

    const getMediaUrl = (path) => {
        if (!path) return '';
        let relative = path;
        const prefixes = ['/var/lib/motion/', '/var/lib/vibe/recordings/'];
        prefixes.forEach(p => { if (relative.startsWith(p)) relative = relative.replace(p, ''); });
        return `${API_BASE}/media/${relative}`;
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
                        setSelectedIds(prev => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                        });
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

    const handleToggleSelect = useCallback((id, isShift) => {
        if (user?.role !== 'admin') return;
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (isShift && lastSelectedId !== null) {
                const allIds = filteredEvents.map(e => e.id);
                const start = allIds.indexOf(lastSelectedId);
                const end = allIds.indexOf(id);
                if (start !== -1 && end !== -1) {
                    const [rangeStart, rangeEnd] = start < end ? [start, end] : [end, start];
                    allIds.slice(rangeStart, rangeEnd + 1).forEach(rid => next.add(rid));
                }
            } else {
                if (next.has(id)) next.delete(id);
                else next.add(id);
            }
            return next;
        });
        setLastSelectedId(id);
    }, [filteredEvents, lastSelectedId]);

    const handleBulkDelete = async () => {
        const count = selectedIds.size;
        if (count === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${count} Events`,
            message: `Are you sure you want to delete ${count} selected events?`,
            onConfirm: async () => {
                setIsBulkDeleting(true);
                try {
                    const res = await fetch(`${API_BASE}/events/bulk-delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ event_ids: Array.from(selectedIds) })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setEvents(prev => prev.filter(e => !selectedIds.has(e.id)));
                        if (selectedEvent && selectedIds.has(selectedEvent.id)) setSelectedEvent(null);
                        setSelectedIds(new Set());
                        showToast(`Successfully deleted ${data.deleted_count} events`, 'success');
                    } else {
                        showToast('Failed to perform bulk delete', 'error');
                    }
                } catch (err) {
                    showToast('Error during bulk delete: ' + err.message, 'error');
                } finally {
                    setIsBulkDeleting(false);
                    setConfirmConfig({ isOpen: false });
                }
            },
            onCancel: () => setConfirmConfig({ isOpen: false })
        });
    };

    const handleSelectAll = () => {
        if (user?.role !== 'admin') return;
        if (selectedIds.size === filteredEvents.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredEvents.map(e => e.id)));
    };

    const groupedEvents = useMemo(() => {
        return filteredEvents.reduce((acc, event) => {
            const dateKey = new Date(event.timestamp_start).toLocaleDateString();
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(event);
            return acc;
        }, {});
    }, [filteredEvents]);

    const videoRef = useRef(null);
    const [autoplayNext, setAutoplayNext] = useState(() => JSON.parse(localStorage.getItem('vibe_autoplay_next') || 'true'));
    const [playbackSpeed, setPlaybackSpeed] = useState(() => Number(localStorage.getItem('vibe_playback_speed') || '1.0'));
    const [autoplayDirection, setAutoplayDirection] = useState(() => localStorage.getItem('vibe_autoplay_direction') || 'desc');

    useEffect(() => { localStorage.setItem('vibe_autoplay_next', JSON.stringify(autoplayNext)); }, [autoplayNext]);
    useEffect(() => { localStorage.setItem('vibe_autoplay_direction', autoplayDirection); }, [autoplayDirection]);
    useEffect(() => { localStorage.setItem('vibe_playback_speed', playbackSpeed); }, [playbackSpeed]);
    useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = playbackSpeed; }, [playbackSpeed, selectedEvent]);

    const goToNextEvent = useCallback(() => {
        if (!selectedEvent) return;
        const allEvents = filteredEvents;
        const currentIndex = allEvents.findIndex(e => e.id === selectedEvent.id);
        if (currentIndex === -1) return;
        let nextIndex = -1;
        if (autoplayDirection === 'desc') { if (currentIndex < allEvents.length - 1) nextIndex = currentIndex + 1; }
        else { if (currentIndex > 0) nextIndex = currentIndex - 1; }
        if (nextIndex !== -1) setSelectedEvent(allEvents[nextIndex]);
    }, [autoplayDirection, selectedEvent, filteredEvents]);

    const handleVideoEnded = () => { if (autoplayNext) goToNextEvent(); };

    useEffect(() => {
        let timer;
        if (autoplayNext && selectedEvent && selectedEvent.type === 'snapshot') {
            timer = setTimeout(() => { goToNextEvent(); }, 5000);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [autoplayNext, selectedEvent, goToNextEvent]);

    return (
        <div className="h-full flex flex-col px-5 py-4 lg:p-8">
            <div className="mb-4">
                <h2 className="text-3xl font-bold tracking-tight flex items-baseline gap-2">
                    Timeline <span className="text-lg font-normal text-muted-foreground">({filteredEvents.length} events)</span>
                </h2>
                <p className="text-muted-foreground mt-2">Browse recorded events and media.</p>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                {/* Mobile Preview */}
                {isMobileView && (
                    <EventPreview 
                        isMobile={true}
                        selectedEvent={selectedEvent} getCameraName={getCameraName} getCamera={getCamera} getMediaUrl={getMediaUrl} setSelectedEvent={setSelectedEvent}
                        autoplayNext={autoplayNext} setAutoplayNext={setAutoplayNext} autoplayDirection={autoplayDirection} setAutoplayDirection={setAutoplayDirection}
                        playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed} handleVideoEnded={handleVideoEnded} handleDelete={handleDelete} videoRef={videoRef} user={user}
                    />
                )}

                {/* Event List & Ruler */}
                <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col">
                    <EventFilters 
                        cameras={cameras} selectedCameraFilter={selectedCameraFilter} setSelectedCameraFilter={setSelectedCameraFilter}
                        selectedTypeFilter={selectedTypeFilter} setSelectedTypeFilter={setSelectedTypeFilter}
                        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                        onReset={() => {
                            const today = new Date().toLocaleDateString('en-CA');
                            setSelectedDate(today); setSelectedHour(null); setSelectedCameraFilter('all'); setSelectedTypeFilter('all'); setSearchParams({});
                        }}
                        selectedHour={selectedHour} setSelectedHour={setSelectedHour} searchParams={searchParams} setSearchParams={setSearchParams}
                    />

                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 flex gap-2 min-h-0 p-3">
                            <HourTimeline events={events} onHourClick={(h) => setSelectedHour(selectedHour === h ? null : h)} selectedHour={selectedHour} />
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-[13px]">
                                {filteredEvents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                        <Calendar className="w-10 h-10 mb-3 opacity-30" />
                                        <p className="text-sm">No events found</p>
                                    </div>
                                ) : (
                                    Object.entries(groupedEvents).map(([date, dateEvents]) => (
                                        <div key={date}>
                                            <div className="sticky top-0 bg-background/90 backdrop-blur-sm py-1.5 mb-1 z-10 text-[10px] font-semibold text-muted-foreground uppercase">{date}</div>
                                            <div className="space-y-1.5">
                                                {dateEvents.map(event => (
                                                    <EventCard 
                                                        key={event.id} event={event} camera={getCamera(event.camera_id)} isSelected={selectedEvent?.id === event.id} isMultiSelected={selectedIds.has(event.id)}
                                                        onClick={(e) => { if (user?.role === 'admin' && selectedIds.size > 0 && !e.shiftKey) handleToggleSelect(event.id, false); else setSelectedEvent(event); }}
                                                        onToggleSelect={handleToggleSelect} getMediaUrl={getMediaUrl} onDelete={handleDelete}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop Preview */}
                {!isMobileView && (
                    <div className="hidden lg:flex flex-1 bg-card border border-border rounded-xl p-4 flex-col min-h-0 sticky top-8 h-[calc(100dvh-4rem)] self-start">
                        <EventPreview 
                            selectedEvent={selectedEvent} getCameraName={getCameraName} getCamera={getCamera} getMediaUrl={getMediaUrl} setSelectedEvent={setSelectedEvent}
                            autoplayNext={autoplayNext} setAutoplayNext={setAutoplayNext} autoplayDirection={autoplayDirection} setAutoplayDirection={setAutoplayDirection}
                            playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed} handleVideoEnded={handleVideoEnded} handleDelete={handleDelete} videoRef={videoRef} user={user}
                        />
                    </div>
                )}

                <ConfirmModal {...confirmConfig} />
                <BulkActionBar selectedIds={selectedIds} filteredEvents={filteredEvents} handleSelectAll={handleSelectAll} setSelectedIds={setSelectedIds} handleBulkDelete={handleBulkDelete} isBulkDeleting={isBulkDeleting} user={user} />
            </div>
        </div>
    );
};
