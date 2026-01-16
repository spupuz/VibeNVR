import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CameraOff, Maximize2, Settings, Image as ImageIcon, Play, Square, Power, Disc, Grid } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const VideoPlayer = ({ camera, index, onFocus, isFocused, onToggleActive, onToggleRecording, isDetectingMotion }) => {
    const { token } = useAuth();
    const [loadState, setLoadState] = useState('idle'); // idle, loading, loaded, error
    const [retryKey, setRetryKey] = useState(0);
    const [cacheBuster, setCacheBuster] = useState(Date.now());
    const navigate = useNavigate();

    useEffect(() => {
        // Staggered loading start
        const startTimer = setTimeout(() => {
            setLoadState('loading');
        }, index * 200);

        return () => clearTimeout(startTimer);
    }, [index]);

    useEffect(() => {
        // Watchdog & Auto-Retry
        let timeoutId;

        if (loadState === 'loading') {
            timeoutId = setTimeout(() => {
                setLoadState('error');
            }, 10000); // 10s connection timeout
        } else if (loadState === 'error') {
            timeoutId = setTimeout(() => {
                console.log(`Auto-retrying camera ${camera.id}...`);
                setRetryKey(prev => prev + 1);
                setCacheBuster(Date.now());
                setLoadState('loading');
            }, 2000); // Retry every 2 seconds (faster recovery)
        }

        return () => clearTimeout(timeoutId);
    }, [loadState, camera.id]);

    const handleFullscreen = (e) => {
        const el = e.currentTarget.closest('.video-container');
        if (el.requestFullscreen) el.requestFullscreen();
    };


    const streamUrl = (camera.stream_url || `http://localhost:5000/cameras/${camera.id}/stream`) + `?cb=${cacheBuster}`;

    return (
        <div className={`video-container relative w-full bg-black rounded-xl overflow-hidden aspect-video group border border-border ${isFocused ? 'ring-2 ring-primary' : ''}`}>
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-start pointer-events-none">
                <div className="pointer-events-auto">
                    <h3 className="text-white font-medium text-sm text-shadow">{camera.name}</h3>
                    <p className="text-white/70 text-xs">{camera.location || `${camera.resolution_width}x${camera.resolution_height}`}</p>
                </div>
                <div className="flex space-x-1.5 pointer-events-auto">
                    {/* Motion Active Indicator */}
                    {(isDetectingMotion || camera.recording_mode === 'Continuous') && (
                        <div className="px-2 py-1 bg-red-600/90 text-white rounded-lg flex items-center space-x-1.5 animate-pulse shadow-lg ring-1 ring-red-400/50">
                            <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
                            <span className="text-[10px] font-bold tracking-wider">REC</span>
                        </div>
                    )}
                    <button onClick={() => onFocus(camera.id)} className={`p-1.5 rounded-lg text-white backdrop-blur-sm transition-colors ${isFocused ? 'bg-primary' : 'bg-black/50 hover:bg-white/20'}`} title={isFocused ? "Show All Users" : "Focus Camera"}>
                        <Square className="w-4 h-4" />
                    </button>
                    <button onClick={handleFullscreen} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Fullscreen">
                        <Maximize2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => {
                        fetch(`http://localhost:5000/cameras/${camera.id}/snapshot`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` }
                        })
                            .then(res => {
                                if (res.ok) alert(`Snapshot triggered for ${camera.name}`);
                                else alert('Failed to trigger snapshot');
                            })
                            .catch(err => console.error(err));
                    }} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Take Snapshot">
                        <Camera className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=images`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Picture Browser">
                        <ImageIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=videos`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Movie Browser">
                        <Play className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/cameras?edit=${camera.id}`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Settings">
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Video Content Layer - Absolute Inset for stability */}
            {loadState === 'error' ? (
                <div className="absolute inset-0 w-full h-full">
                    <img
                        src="/no-signal.png"
                        alt="No Signal"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black/80 text-white px-3 py-1 rounded text-sm font-mono tracking-widest border border-white/20">NO SIGNAL</span>
                    </div>
                </div>
            ) : loadState === 'idle' ? (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/90">
                    <span className="text-white/50 text-xs animate-pulse">Initializing...</span>
                </div>
            ) : (
                <img
                    key={retryKey}
                    src={streamUrl}
                    alt={camera.name}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loadState === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setLoadState('loaded')}
                    onError={() => setLoadState('error')}
                />
            )}
            {/* Loading Spinner overlay */}
            {loadState === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none space-y-2">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    {retryKey > 0 && <span className="text-white/80 text-xs font-medium animate-pulse">Reconnecting...</span>}
                </div>
            )}

            {/* Status Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end z-10">
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => onToggleActive(camera)}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm border border-white/10 ${camera.is_active ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}
                        title={camera.is_active ? "Disable Camera" : "Enable Camera"}
                    >
                        <Power className="w-3 h-3" />
                        <span>{camera.is_active ? 'ON' : 'OFF'}</span>
                    </button>

                    <div className={`px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm border border-white/10 flex items-center space-x-1 ${camera.recording_mode !== 'Off' ? 'bg-blue-500/20 text-blue-200 border-blue-500/30' : 'bg-black/40 text-muted-foreground'}`}>
                        {camera.recording_mode !== 'Off' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        <span>Mode: {camera.recording_mode}</span>
                    </div>
                </div>

                <button
                    onClick={() => onToggleRecording(camera)}
                    className={`p-2 rounded-full backdrop-blur-sm transition-all ${camera.recording_mode === 'Always' ? 'bg-red-500 text-white scale-110' : 'bg-white/10 text-white hover:bg-red-500/50'}`}
                    title={camera.recording_mode === 'Always' ? "Stop Recording" : "Start Recording"}
                >
                    <Disc className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export const LiveView = () => {
    const { token } = useAuth();
    const [cameras, setCameras] = useState([]);
    const [activeMotionIds, setActiveMotionIds] = useState([]);
    const [focusCameraId, setFocusCameraId] = useState(null);
    const [columnSetting, setColumnSetting] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    const fetchCameras = () => {
        fetch('http://localhost:5000/cameras', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setCameras(data))
            .catch(err => console.error(err));
    };

    const fetchMotionStatus = () => {
        fetch('http://localhost:5000/events/status', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setActiveMotionIds(data.active_ids || []);
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
            const res = await fetch(`http://localhost:5000/cameras/${camera.id}`, {
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
            const res = await fetch(`http://localhost:5000/cameras/${camera.id}/recording`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (res.ok) fetchCameras();
        } catch (err) { console.error(err); }
    };

    // Filter cameras if focused
    const displayCameras = focusCameraId
        ? cameras.filter(c => c.id === focusCameraId)
        : cameras;

    return (
        <div className="h-full flex flex-col px-4 py-2">
            <div className="mb-4 flex justify-between items-center px-2 pt-2">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        Live View
                        <span className="text-sm font-normal text-muted-foreground hidden sm:inline-block">({cameras.length} cameras)</span>
                    </h2>
                </div>
                <div className="flex items-center space-x-2">
                    {/* Column Selector */}
                    <div className="flex items-center space-x-1 bg-card border border-border rounded-lg p-1">
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

            <div className={`grid gap-4 flex-1 min-h-0 ${focusCameraId ? 'grid-cols-1' :
                columnSetting === 'auto' ? (
                    cameras.length <= 1 ? 'grid-cols-1' :
                        cameras.length <= 4 ? 'grid-cols-2' :
                            'grid-cols-3'
                ) : (
                    columnSetting === '1' ? 'grid-cols-1' :
                        columnSetting === '2' ? 'grid-cols-2' :
                            columnSetting === '3' ? 'grid-cols-3' :
                                columnSetting === '4' ? 'grid-cols-4' : 'grid-cols-3'
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
                        isDetectingMotion={activeMotionIds.includes(cam.id)}
                    />
                ))}
            </div>

            {cameras.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <p>No cameras configured.</p>
                </div>
            )}
        </div>
    );
};
