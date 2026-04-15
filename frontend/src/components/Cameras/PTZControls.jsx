import React, { useState, useCallback, useRef } from 'react';
import { 
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
    Link, Plus, Minus, Move, Loader2, X, Square,
    Home, Save
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmModal } from '../ui/ConfirmModal';

export const PTZControls = ({ camera, onClose }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const cameraId = camera.id;
    const [activeAction, setActiveAction] = useState(null);
    const [isProbing, setIsProbing] = useState(false);
    const [isGoingHome, setIsGoingHome] = useState(false);
    const [isSettingHome, setIsSettingHome] = useState(false);
    const [showSetHomeConfirm, setShowSetHomeConfirm] = useState(false);
    const stopRef = useRef(null);

    const canPanTilt = camera?.ptz_can_pan_tilt ?? true;
    const canZoom = camera?.ptz_can_zoom ?? true;
    const canHome = camera?.ptz_can_home ?? true;
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

    const gotoHome = useCallback(async () => {
        setIsGoingHome(true);
        try {
            const res = await fetch(`/api/onvif/ptz/goto-home/${cameraId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                showToast("Moving to Home position...", "success");
            } else {
                showToast(data.detail || "Failed to trigger Home navigation", "error");
            }
        } catch (err) {
            console.error('PTZ GotoHome failed', err);
            showToast("Network error while triggering Home", "error");
        } finally {
            setIsGoingHome(false);
        }
    }, [cameraId, token, showToast]);

    const setHome = () => {
        setShowSetHomeConfirm(true);
    };

    const handleConfirmSetHome = async () => {
        setShowSetHomeConfirm(false);
        setIsSettingHome(true);
        try {
            const res = await fetch(`/api/onvif/ptz/set-home/${cameraId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                showToast("New Home position saved to camera memory", "success");
            } else {
                showToast(data.detail || "Failed to save Home position", "error");
            }
        } catch (err) {
            console.error('PTZ SetHome failed', err);
            showToast("Network error while saving Home position", "error");
        } finally {
            setIsSettingHome(false);
        }
    };

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

            {!hasAnyPTZ && (
                <div className="bg-background/90 backdrop-blur-md p-6 rounded-2xl border border-border shadow-2xl pointer-events-auto flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                    <div className="p-3 bg-muted rounded-full">
                        <Move className="w-8 h-8 text-muted-foreground opacity-50" />
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-sm">PTZ Not Supported</p>
                        <p className="text-[10px] text-muted-foreground mt-1 max-w-[180px]">
                            This camera does not appear to support PTZ commands via ONVIF. Configure it in Camera Settings.
                        </p>
                    </div>
                </div>
            )}

            {hasAnyPTZ && (
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

                    {/* Advanced PTZ Utils (Home/Save) - Bottom Left */}
                    {canPanTilt && canHome && (
                        <div className="absolute bottom-4 left-4 flex flex-col gap-3 pointer-events-auto">
                            <button 
                                onClick={gotoHome}
                                disabled={isGoingHome}
                                onContextMenu={(e) => e.preventDefault()}
                                className="p-3 rounded-full bg-background/80 hover:bg-indigo-500 hover:text-white border border-border shadow-lg transition-all active:scale-95 flex items-center justify-center"
                                title="Go to Home Position"
                            >
                                {isGoingHome ? <Loader2 className="w-5 h-5 animate-spin" /> : <Home className="w-5 h-5" />}
                            </button>
                            <button 
                                onClick={setHome}
                                disabled={isSettingHome || isGoingHome}
                                onContextMenu={(e) => e.preventDefault()}
                                className="p-3 rounded-full bg-background/80 hover:bg-green-600 hover:text-white border border-border shadow-lg transition-all active:scale-95 flex items-center justify-center"
                                title="Set Current as Home"
                            >
                                {isSettingHome ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            </button>
                        </div>
                    )}

                    {/* Zoom Controls - Bottom Right */}
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
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        <div className="bg-black/60 text-white text-[10px] px-3 py-1 rounded-full border border-white/20 backdrop-blur-md">
                            Press and hold to move • Release to stop
                        </div>
                        <div className="text-[8px] text-white/40 italic">
                            Home positions are stored on the camera hardware
                        </div>
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={showSetHomeConfirm}
                title="Set Home Position"
                message="Set the current camera position as the new Home position? This will overwrite the previous home coordinates."
                confirmText="Set Home"
                onConfirm={handleConfirmSetHome}
                onCancel={() => setShowSetHomeConfirm(false)}
                variant="primary"
            />
        </div>
    );
};
