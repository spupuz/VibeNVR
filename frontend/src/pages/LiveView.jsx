import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraOff, Maximize2, Settings, Image as ImageIcon, Play, Square, Power, Disc } from 'lucide-react';

const VideoPlayer = ({ camera, onFocus, isFocused, onToggleActive, onToggleRecording, isDetectingMotion }) => {
    const [error, setError] = useState(false);
    const navigate = useNavigate();

    const handleFullscreen = (e) => {
        // Simple DOM fullscreen for the container
        const el = e.currentTarget.closest('.video-container');
        if (el.requestFullscreen) el.requestFullscreen();
    };

    return (
        <div className={`video-container relative bg-black rounded-xl overflow-hidden aspect-video group border border-border ${isFocused ? 'ring-2 ring-primary' : ''}`}>
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-start">
                <div>
                    <h3 className="text-white font-medium text-sm text-shadow">{camera.name}</h3>
                    <p className="text-white/70 text-xs">{camera.location || `${camera.resolution_width}x${camera.resolution_height}`}</p>
                </div>
                <div className="flex space-x-1.5">
                    {/* Motion Active Indicator */}
                    {isDetectingMotion && (
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
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=image`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Picture Browser">
                        <ImageIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/timeline?camera=${camera.id}&type=video`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Movie Browser">
                        <Play className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/cameras?edit=${camera.id}`)} className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm" title="Settings">
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Video Content */}
            {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
                    <CameraOff className="w-12 h-12 mb-2 opacity-50" />
                    <span className="text-sm">No Signal</span>
                    {camera.rtsp_url && (
                        <span className="text-xs text-orange-500 mt-1 px-2 py-0.5 bg-orange-500/10 rounded">
                            RTSP not supported in browser
                        </span>
                    )}
                </div>
            ) : (
                <img
                    src={camera.stream_url || `http://localhost:5000/cameras/${camera.id}/stream`}
                    alt={camera.name}
                    className="w-full h-full object-cover"
                    onError={() => setError(true)}
                />
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
    const [cameras, setCameras] = useState([]);
    const [activeMotionIds, setActiveMotionIds] = useState([]);
    const [focusCameraId, setFocusCameraId] = useState(null);
    const [columnSetting, setColumnSetting] = useState(() => {
        return localStorage.getItem('liveViewColumns') || 'auto';
    });

    const fetchCameras = () => {
        fetch('http://localhost:5000/cameras')
            .then(res => res.json())
            .then(data => setCameras(data))
            .catch(err => console.error(err));
    };

    const fetchMotionStatus = () => {
        fetch('http://localhost:5000/events/status')
            .then(res => res.json())
            .then(data => {
                setActiveMotionIds(data.active_ids || []);
            })
            .catch(err => console.error("Failed to fetch motion status", err));
    };

    useEffect(() => {
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
    }, []);

    const toggleFocus = (id) => {
        setFocusCameraId(prev => prev === id ? null : id);
    };

    const handleToggleActive = async (camera) => {
        try {
            const res = await fetch(`http://localhost:5000/cameras/${camera.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...camera, is_active: !camera.is_active })
            });
            if (res.ok) fetchCameras();
        } catch (err) { console.error(err); }
    };

    const handleToggleRecording = async (camera) => {
        const newMode = camera.recording_mode === 'Always' ? 'Motion Triggered' : 'Always';
        try {
            const res = await fetch(`http://localhost:5000/cameras/${camera.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...camera, recording_mode: newMode })
            });
            if (res.ok) fetchCameras();
        } catch (err) { console.error(err); }
    };

    // Filter cameras if focused
    const displayCameras = focusCameraId
        ? cameras.filter(c => c.id === focusCameraId)
        : cameras;

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Live View</h2>
                    <p className="text-muted-foreground text-sm">Real-time monitoring ({cameras.length} cameras)</p>
                </div>
                {focusCameraId && (
                    <button onClick={() => setFocusCameraId(null)} className="text-sm text-primary hover:underline">
                        Show All Cameras
                    </button>
                )}
            </div>

            <div className={`grid gap-4 h-full transition-all duration-300 ${focusCameraId ? 'grid-cols-1' :
                columnSetting === 'auto' ? (
                    cameras.length <= 1 ? 'grid-cols-1' :
                        cameras.length <= 4 ? 'grid-cols-2' :
                            'grid-cols-3'
                ) : `grid-cols-${columnSetting}`
                }`}>
                {displayCameras.map(cam => (
                    <VideoPlayer
                        key={cam.id}
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
