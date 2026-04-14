import React, { useState, useCallback, useRef } from 'react';
import { 
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
    Link, Plus, Minus, Move, Loader2, X, Square 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const PTZControls = ({ camera, onClose }) => {
    const { token } = useAuth();
    const cameraId = camera.id;
    const [activeAction, setActiveAction] = useState(null);
    const [isProbing, setIsProbing] = useState(false);
    const stopRef = useRef(null);

    // Capabilities from camera object
    const canPanTilt = camera.ptz_can_pan_tilt !== false;
    const canZoom = camera.ptz_can_zoom !== false;
    const hasAnyPTZ = canPanTilt || canZoom;

    const sendPTZCommand = useCallback(async (pan, tilt, zoom, actionName) => {
        try {
            setActiveAction(actionName);
            await fetch(`/api/onvif/ptz/move/${cameraId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ pan, tilt, zoom })
            });
        } catch (err) {
            console.error('PTZ Move failed', err);
        }
    }, [cameraId, token]);

    const stopPTZ = useCallback(async () => {
        setActiveAction(null);
        try {
            await fetch(`/api/onvif/ptz/stop/${cameraId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
        } catch (err) {
            console.error('PTZ Stop failed', err);
        }
    }, [cameraId, token]);

    const probeFeatures = useCallback(async () => {
        setIsProbing(true);
        try {
            await fetch(`/api/onvif/ptz/probe-features/${cameraId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            // The parent should ideally refresh camera data, 
            // but for now we just show it's done.
            // In a real app, we'd use a global state or refresh callback.
        } catch (err) {
            console.error('PTZ Probe failed', err);
        } finally {
            setIsProbing(false);
        }
    }, [cameraId, token]);

    const handleActionStart = (pan, tilt, zoom, action) => {
        sendPTZCommand(pan, tilt, zoom, action);
    };

    const handleActionEnd = () => {
        handleActionEndSync();
    };
    
    const handleActionEndSync = () => {
        stopPTZ();
    };

    const ControlButton = ({ icon: Icon, onClickStart, action, className = "" }) => (
        <button
            onPointerDown={(e) => {
                // Ensure we don't trigger context menus or scroll on hold
                if (e.pointerType === 'touch') e.target.releasePointerCapture(e.pointerId);
                onClickStart();
            }}
            onPointerUp={(e) => {
                if (activeAction === action) handleActionEndSync();
            }}
            onPointerLeave={(e) => {
                if (activeAction === action) handleActionEndSync();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`p-3 rounded-full bg-background/80 hover:bg-primary hover:text-primary-foreground border border-border transition-all active:scale-95 shadow-lg group touch-none select-none ${className} ${activeAction === action ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 scale-110' : ''}`}
            title={action}
        >
            <Icon className={`w-5 h-5 ${activeAction === action ? 'animate-pulse' : ''}`} />
        </button>
    );

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/5 pointer-events-none group-hover:bg-black/10 transition-colors">

            {/* Close Button */}
            {onClose && (
                <button
                    onClick={onClose}
                    onContextMenu={(e) => e.preventDefault()}
                    className="absolute top-2 right-2 z-[110] p-2 bg-background/80 hover:bg-red-500 hover:text-white rounded-full border border-border shadow-xl pointer-events-auto transition-all active:scale-90"
                    title="Close PTZ Controls"
                >
                    <X className="w-5 h-5" />
                </button>
            )}

            {!hasAnyPTZ ? (
                <div className="bg-background/90 backdrop-blur-md p-6 rounded-2xl border border-border shadow-2xl pointer-events-auto flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                    <div className="p-3 bg-muted rounded-full">
                        <Move className="w-8 h-8 text-muted-foreground opacity-50" />
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-sm">PTZ Not Supported</p>
                        <p className="text-[10px] text-muted-foreground mt-1 max-w-[180px]">
                            This camera does not appear to support PTZ commands via ONVIF.
                        </p>
                    </div>
                    <button 
                        onClick={probeFeatures}
                        disabled={isProbing}
                        className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                    >
                        {isProbing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {isProbing ? 'Probing...' : 'Re-Probe Device'}
                    </button>
                </div>
            ) : (
                <>
                    {/* D-Pad Container */}
                    {canPanTilt && (
                        <div className="relative w-40 h-40 pointer-events-auto">
                            {/* Center Stop Button */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                <button 
                                    onClick={stopPTZ}
                                    onContextMenu={(e) => e.preventDefault()}
                                    className="p-3 rounded-full bg-red-500 text-white shadow-xl hover:bg-red-600 transition-colors select-none flex items-center justify-center"
                                    title="Emergency Stop"
                                >
                                    {activeAction ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Square className="w-4 h-4 fill-current" />
                                    )}
                                </button>
                            </div>

                            {/* Arrows */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2">
                                <ControlButton 
                                    icon={ChevronUp} 
                                    onClickStart={() => handleActionStart(0, 1, 0, 'up')} 
                                    action="up" 
                                />
                            </div>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                                <ControlButton 
                                    icon={ChevronDown} 
                                    onClickStart={() => handleActionStart(0, -1, 0, 'down')} 
                                    action="down" 
                                />
                            </div>
                            <div className="absolute left-0 top-1/2 -translate-y-1/2">
                                <ControlButton 
                                    icon={ChevronLeft} 
                                    onClickStart={() => handleActionStart(-1, 0, 0, 'left')} 
                                    action="left" 
                                />
                            </div>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2">
                                <ControlButton 
                                    icon={ChevronRight} 
                                    onClickStart={() => handleActionStart(1, 0, 0, 'right')} 
                                    action="right" 
                                />
                            </div>
                        </div>
                    )}

                    {/* Zoom Controls */}
                    {canZoom && (
                        <div className="absolute bottom-4 right-4 flex flex-col gap-3 pointer-events-auto">
                            <ControlButton 
                                icon={Plus} 
                                onClickStart={() => handleActionStart(0, 0, 1, 'zoom-in')} 
                                action="zoom-in" 
                            />
                            <ControlButton 
                                icon={Minus} 
                                onClickStart={() => handleActionStart(0, 0, -1, 'zoom-out')} 
                                action="zoom-out" 
                            />
                        </div>
                    )}

                    {/* Hint overlay - Moved higher to avoid overlapping buttons */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full border border-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        Press and hold to move • Release to stop
                    </div>
                </>
            )}
        </div>
    );
};
