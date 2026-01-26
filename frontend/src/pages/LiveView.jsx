import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CameraOff, Maximize2, Settings, Image as ImageIcon, Play, Square, Power, Disc, Grid } from 'lucide-react';
import { Toggle } from '../components/ui/FormControls';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = `/api`;

const VideoPlayer = ({ camera, index, onFocus, isFocused, onToggleActive, onToggleRecording, isRecording, isLiveMotion }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [loadState, setLoadState] = useState('loading');
    const [frameSrc, setFrameSrc] = useState('');
    const navigate = useNavigate();
    const pollingRef = useRef(null);
    const mountedRef = useRef(true);

    // JPEG Polling - Recursive "Fetch then Wait" pattern to prevent connection flooding
    useEffect(() => {
        mountedRef.current = true;
        let timeoutId = null;

        const fetchFrame = async () => {
            if (!mountedRef.current) return;

            try {
                const response = await fetch(`${API_BASE}/cameras/${camera.id}/frame?t=${Date.now()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!mountedRef.current) return;

                if (response.ok) {
                    const blob = await response.blob();
                    if (!mountedRef.current) return;

                    const url = URL.createObjectURL(blob);
                    setFrameSrc(prev => {
                        if (prev) URL.revokeObjectURL(prev); // Clean up old blob
                        return url;
                    });
                    setLoadState('loaded');
                } else {
                    // Don't show error immediately on single failure to reduce flicker
                    // setLoadState('error');
                }
            } catch (err) {
                // Network error (e.g. abort or connection reset)
                console.debug(`Frame fetch error for ${camera.id}`, err);
            } finally {
                if (mountedRef.current) {
                    // adaptive delay: very fast if focused, restricted if grid
                    // Serial execution guarantees no queue buildup
                    const delay = isFocused ? 50 : 200;
                    timeoutId = setTimeout(fetchFrame, delay);
                }
            }
        };

        // Staggered start to reduce initial spike
        const startDelay = setTimeout(() => {
            fetchFrame();
        }, index * 150);

        return () => {
            mountedRef.current = false;
            clearTimeout(startDelay);
            if (timeoutId) clearTimeout(timeoutId);

            // Clean up blob URL
            setFrameSrc(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return '';
            });
        };
    }, [camera.id, token, index, isFocused]);

    const handleFullscreen = (e) => {
        const el = e.currentTarget.closest('.video-container');
        if (el.requestFullscreen) el.requestFullscreen();
    };

    return (
        <div className={`video-container relative w-full bg-black rounded-xl overflow-hidden aspect-video group transition-all duration-300 ${isFocused ? 'ring-4 ring-primary z-30' : 'z-10'}`}>

            {/* VIBRANT INTERNAL BORDER (Prevents clipping) */}
            <div className={`absolute inset-0 rounded-xl pointer-events-none z-50 transition-all duration-300 ${isLiveMotion
                ? 'border-[4px] border-red-600 shadow-[inset_0_0_20px_rgba(220,38,38,0.4)]'
                : camera.recording_mode === 'Always'
                    ? 'border-[4px] border-blue-600 shadow-[inset_0_0_20px_rgba(37,99,235,0.3)]'
                    : 'border border-white/10'
                }`}
            />

            {/* TOP LEFT - STATUS & INFO (Stacked, no overlap) */}
            <div className="absolute top-2 left-2 z-40 flex flex-col gap-1.5 pointer-events-none">
                {isLiveMotion ? (
                    <div className="flex items-center space-x-2 bg-red-600 px-2 py-1 rounded shadow-2xl animate-pulse ring-1 ring-white/40 w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                        <span className="text-[10px] font-black text-white tracking-widest uppercase">MOTION</span>
                    </div>
                ) : camera.recording_mode === 'Always' ? (
                    <div className="flex items-center space-x-2 bg-blue-600 px-2.5 py-1 rounded shadow-2xl ring-1 ring-white/20 w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-200" />
                        <span className="text-[10px] font-black text-white tracking-widest uppercase">ALWAYS REC</span>
                    </div>
                ) : null}

                {/* Camera Information Card (Below badges) */}
                <div className="bg-black/60 backdrop-blur-md px-2.5 py-2 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-fit max-w-[200px]">
                    <h3 className="text-white font-bold text-xs sm:text-sm tracking-tight leading-tight truncate">
                        {camera.name}
                    </h3>
                    <div className="text-white/50 text-[9px] mt-0.5 font-mono">
                        {camera.resolution_width}x{camera.resolution_height}
                    </div>
                </div>
            </div>

            {/* ACTION BAR - Bottom Centered, clean and accessible */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex justify-center pointer-events-none">
                <div className="flex items-center gap-1 sm:gap-2 bg-black/80 backdrop-blur-xl p-1 sm:p-1.5 rounded-2xl border border-white/10 shadow-3xl pointer-events-auto">
                    {/* View Controls */}
                    <button onClick={() => onFocus(camera.id)} className={`p-1.5 sm:p-2 rounded-xl text-white transition-all ${isFocused ? 'bg-primary' : 'hover:bg-white/10'}`} title="Focus">
                        <Square className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                    <button onClick={handleFullscreen} className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-xl transition-all" title="Fullscreen">
                        <Maximize2 className="w-4 h-4 sm:w-5 h-5" />
                    </button>

                    <div className="w-px h-6 bg-white/10 mx-0.5 sm:mx-1 self-center" />

                    {/* Snapshot & Media Browser */}
                    <button onClick={() => {
                        fetch(`${API_BASE}/cameras/${camera.id}/snapshot`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` }
                        }).then(res => { if (res.ok) showToast(`Snapshot saved`, 'success'); });
                    }} className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-xl transition-all" title="Take Photo">
                        <Camera className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=snapshot`)} className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-xl transition-all" title="Gallery">
                        <ImageIcon className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=video`)} className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-xl transition-all" title="Videos">
                        <Play className="w-4 h-4 sm:w-5 h-5" />
                    </button>

                    <div className="w-px h-6 bg-white/10 mx-0.5 sm:mx-1 self-center" />

                    {/* Always Record Toggle */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleRecording(camera);
                        }}
                        className={`p-1.5 sm:p-2 rounded-xl transition-all ${camera.recording_mode === 'Always' ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.6)]' : 'text-white hover:bg-red-600/50'}`}
                        title={camera.recording_mode === 'Always' ? "Stop Always Recording" : "Start Always Recording"}
                    >
                        <Disc className="w-4 h-4 sm:w-5 h-5" />
                    </button>

                    <button onClick={() => navigate(`/cameras?edit=${camera.id}`)} className="p-1.5 sm:p-2 text-primary-foreground bg-primary hover:bg-primary/80 rounded-xl transition-all" title="Settings">
                        <Settings className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Video Content Layer */}
            {loadState === 'error' ? (
                <div className="absolute inset-0 w-full h-full">
                    <img src="/no-signal.png" alt="No Signal" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black/80 text-white px-3 py-1 rounded text-[10px] font-mono tracking-widest border border-white/20">NO SIGNAL</span>
                    </div>
                </div>
            ) : frameSrc ? (
                <img
                    src={frameSrc}
                    alt={camera.name}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/90">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
};

export const LiveView = () => {
    const { token } = useAuth();
    const [cameras, setCameras] = useState([]);
    const [activeMotionIds, setActiveMotionIds] = useState([]);
    const [liveMotionIds, setLiveMotionIds] = useState([]);
    const [focusCameraId, setFocusCameraId] = useState(null);
    const [columnSetting, setColumnSetting] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    const fetchCameras = () => {
        fetch(`${API_BASE}/cameras`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setCameras(data))
            .catch(err => console.error(err));
    };

    const fetchMotionStatus = () => {
        fetch(`${API_BASE}/events/status`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setActiveMotionIds(data.active_ids || []);
                setLiveMotionIds(data.live_motion_ids || []);
            })
            .catch(err => console.error("Failed to fetch motion status", err));
    };

    useEffect(() => {
        if (!token) return;

        fetchCameras();
        fetchMotionStatus();

        // Poll for motion status more frequently
        const statusInterval = setInterval(fetchMotionStatus, 3000);
        // Refresh cameras list less frequently
        const cameraInterval = setInterval(fetchCameras, 30000);

        return () => {
            clearInterval(statusInterval);
            clearInterval(cameraInterval);
        };
    }, [token]);

    const toggleFocus = (id) => {
        setFocusCameraId(prev => prev === id ? null : id);
    };

    const handleToggleActive = async (camera) => {
        try {
            const res = await fetch(`${API_BASE}/cameras/${camera.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ ...camera, is_active: !camera.is_active })
            });
            if (res.ok) fetchCameras();
        } catch (err) { console.error(err); }
    };

    const handleToggleRecording = async (camera) => {
        try {
            const res = await fetch(`${API_BASE}/cameras/${camera.id}/recording`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (res.ok) fetchCameras();
        } catch (err) { console.error(err); }
    };

    const [selectedGroup, setSelectedGroup] = useState('all');
    const [isGroupView, setIsGroupView] = useState(() => {
        return localStorage.getItem('liveViewGroupBy') === 'true';
    });

    const handleGroupViewToggle = (val) => {
        setIsGroupView(val);
        localStorage.setItem('liveViewGroupBy', val);
    };

    // Filter active cameras first
    const activeCameras = cameras.filter(c => c.is_active);

    // Derived state for unique groups
    const availableGroups = [...new Set(cameras.flatMap(c => c.groups ? c.groups.map(g => g.name) : []))].sort();

    // Filter by Group
    const groupFilteredCameras = selectedGroup === 'all'
        ? activeCameras
        : activeCameras.filter(c => c.groups && c.groups.some(g => g.name === selectedGroup));

    // Filter cameras if focused
    const displayCameras = focusCameraId
        ? groupFilteredCameras.filter(c => c.id === focusCameraId)
        : groupFilteredCameras;

    return (
        <div className="h-full flex flex-col px-4 sm:px-6 py-2">
            <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-2 pt-2">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        Live View
                        <span className="text-sm font-normal text-muted-foreground hidden sm:inline-block">({cameras.length} cameras)</span>
                    </h2>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">

                    <div className="flex items-center gap-2">
                        {/* Group Selector */}
                        {availableGroups.length > 0 && (
                            <div className="flex items-center space-x-1 bg-card border border-border rounded-lg p-1">
                                <span className="text-xs text-muted-foreground ml-2 font-medium">Group:</span>
                                <select
                                    className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer py-1 pr-8 pl-1 max-w-[100px] sm:max-w-none"
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value)}
                                >
                                    <option value="all">All</option>
                                    {availableGroups.map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Group/List Toggle */}
                        <div className="flex items-center px-2">
                            <Toggle
                                checked={isGroupView}
                                onChange={handleGroupViewToggle}
                                help="Group cameras by section"
                            />
                        </div>
                    </div>

                    {/* Column Selector - Hidden on mobile as it defaults to 1 col anyway */}
                    <div className="hidden sm:flex items-center space-x-1 bg-card border border-border rounded-lg p-1">
                        <Grid className="w-4 h-4 text-muted-foreground ml-2" />
                        <select
                            className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer py-1 pr-8 pl-2"
                            value={columnSetting}
                            onChange={(e) => {
                                const val = e.target.value;
                                setColumnSetting(val);
                                localStorage.setItem('liveViewColumns', val);
                            }}
                        >
                            <option value="auto">Auto</option>
                            <option value="1">1 Col</option>
                            <option value="2">2 Cols</option>
                            <option value="3">3 Cols</option>
                            <option value="4">4 Cols</option>
                        </select>
                    </div>

                    {focusCameraId && (
                        <button onClick={() => setFocusCameraId(null)} className="text-sm text-primary hover:underline">
                            Show All
                        </button>
                    )}
                </div>
            </div>

            {/* Group View Render Logic */}
            {isGroupView && selectedGroup === 'all' && !focusCameraId ? (
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {/* Render Grouped Sections */}
                    {(() => {
                        // 1. Group cameras by their primary group (or first group found)
                        //    Cameras with no group go to "Ungrouped"
                        //    Cameras with multiple groups: we can duplicate them or just pick the first.
                        //    Let's pick the first group name for sorting.
                        const grouped = {};
                        const ungrouped = [];

                        displayCameras.forEach(cam => {
                            if (cam.groups && cam.groups.length > 0) {
                                cam.groups.forEach(g => {
                                    if (!grouped[g.name]) grouped[g.name] = [];
                                    // Prevent duplicates in same group if data is weird, 
                                    // but allow camera in multiple DIFFERENT groups.
                                    if (!grouped[g.name].find(c => c.id === cam.id)) {
                                        grouped[g.name].push(cam);
                                    }
                                });
                            } else {
                                ungrouped.push(cam);
                            }
                        });

                        const sortedGroupNames = Object.keys(grouped).sort();

                        return (
                            <>
                                {sortedGroupNames.map(groupName => (
                                    <div key={groupName}>
                                        <h3 className="text-lg font-semibold mb-2 text-foreground/80 sticky top-0 bg-background/95 backdrop-blur z-20 py-1">{groupName}</h3>
                                        <div className={`grid gap-2 sm:gap-4 ${columnSetting === 'auto' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                                            columnSetting === '1' ? 'grid-cols-1' :
                                                columnSetting === '2' ? 'grid-cols-1 sm:grid-cols-2' :
                                                    columnSetting === '3' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                                                        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                                            }`}>
                                            {grouped[groupName].map((cam, i) => (
                                                <VideoPlayer
                                                    key={cam.id}
                                                    index={i}
                                                    camera={cam}
                                                    onFocus={toggleFocus}
                                                    isFocused={focusCameraId === cam.id}
                                                    onToggleActive={handleToggleActive}
                                                    onToggleRecording={handleToggleRecording}
                                                    isRecording={activeMotionIds.includes(cam.id)}
                                                    isLiveMotion={liveMotionIds.includes(cam.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {ungrouped.length > 0 && (
                                    <div>
                                        {sortedGroupNames.length > 0 && <h3 className="text-lg font-semibold mb-2 text-foreground/80 sticky top-0 bg-background/95 backdrop-blur z-20 py-1">Ungrouped</h3>}
                                        <div className={`grid gap-2 sm:gap-4 ${columnSetting === 'auto' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                                            columnSetting === '1' ? 'grid-cols-1' :
                                                columnSetting === '2' ? 'grid-cols-1 sm:grid-cols-2' :
                                                    columnSetting === '3' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                                                        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                                            }`}>
                                            {ungrouped.map((cam, i) => (
                                                <VideoPlayer
                                                    key={cam.id}
                                                    index={i}
                                                    camera={cam}
                                                    onFocus={toggleFocus}
                                                    isFocused={focusCameraId === cam.id}
                                                    onToggleActive={handleToggleActive}
                                                    onToggleRecording={handleToggleRecording}
                                                    isRecording={activeMotionIds.includes(cam.id)}
                                                    isLiveMotion={liveMotionIds.includes(cam.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            ) : (
                <div className={`grid gap-2 sm:gap-4 flex-1 min-h-0 ${focusCameraId ? 'grid-cols-1' :
                    columnSetting === 'auto' ? (
                        cameras.length <= 1 ? 'grid-cols-1' :
                            cameras.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
                                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                    ) : (
                        columnSetting === '1' ? 'grid-cols-1' :
                            columnSetting === '2' ? 'grid-cols-1 sm:grid-cols-2' :
                                columnSetting === '3' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                                    columnSetting === '4' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                    )
                    }`}>
                    {displayCameras.map((cam, i) => (
                        <VideoPlayer
                            key={cam.id}
                            index={i}
                            camera={cam}
                            onFocus={toggleFocus}
                            isFocused={focusCameraId === cam.id}
                            onToggleActive={handleToggleActive}
                            onToggleRecording={handleToggleRecording}
                            isRecording={activeMotionIds.includes(cam.id)}
                            isLiveMotion={liveMotionIds.includes(cam.id)}
                        />
                    ))}
                </div>
            )}

            {cameras.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <p>No cameras configured.</p>
                </div>
            )}
        </div>
    );
};
