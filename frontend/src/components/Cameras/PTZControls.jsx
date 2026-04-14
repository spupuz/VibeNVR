import React, { useState, useCallback, useRef } from 'react';
import { 
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
    Link, Plus, Minus, Move, Loader2, X 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const PTZControls = ({ cameraId, onClose }) => {
    const { token } = useAuth();
    const [activeAction, setActiveAction] = useState(null);
    const stopRef = useRef(null);

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

    const handleActionStart = (pan, tilt, zoom, action) => {
        sendPTZCommand(pan, tilt, zoom, action);
    };

    const handleActionEnd = () => {
        stopPTZ();
    };

    const ControlButton = ({ icon: Icon, onClickStart, action, className = "" }) => (
        <button
            onMouseDown={() => onClickStart()}
            onMouseUp={handleActionEnd}
            onMouseLeave={handleActionEnd}
            className={`p-3 rounded-full bg-background/80 hover:bg-primary hover:text-primary-foreground border border-border transition-all active:scale-95 shadow-lg group ${className} ${activeAction === action ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2' : ''}`}
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
                    className="absolute top-4 right-4 z-[110] p-2 bg-background/80 hover:bg-red-500 hover:text-white rounded-full border border-border shadow-xl pointer-events-auto transition-all active:scale-90"
                    title="Close PTZ Controls"
                >
                    <X className="w-5 h-5" />
                </button>
            )}

            {/* D-Pad Container */}
            <div className="relative w-40 h-40 pointer-events-auto">
                {/* Center Stop Button */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <button 
                        onClick={stopPTZ}
                        className="p-3 rounded-full bg-red-500 text-white shadow-xl hover:bg-red-600 transition-colors"
                        title="Emergency Stop"
                    >
                        <Loader2 className={`w-4 h-4 ${activeAction ? 'animate-spin' : ''}`} />
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

            {/* Zoom Controls */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 pointer-events-auto">
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

            {/* Hint overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full border border-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Press and hold to move • Release to stop
            </div>
        </div>
    );
};
