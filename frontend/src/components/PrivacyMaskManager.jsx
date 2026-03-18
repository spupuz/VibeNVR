import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Plus, MousePointer2, HelpCircle, X, Check } from 'lucide-react';
import { Button } from './ui/Button';

export const PrivacyMaskManager = ({ 
    cameraId, 
    token, 
    masks = [], 
    onChange,
    label = "Privacy Masks",
    description = "Draw areas that should be permanently blacked out in recordings.",
    color = "#ef4444", // Default red
    hint = ""
}) => {
    const [currentPoints, setCurrentPoints] = useState([]);
    const [localMasks, setLocalMasks] = useState([]);
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

    // Helper to convert hex to rgba
    const hexToRgba = (hex, alpha) => {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex[1] + hex[2], 16);
            g = parseInt(hex[3] + hex[4], 16);
            b = parseInt(hex[5] + hex[6], 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Initialize local masks from prop
    useEffect(() => {
        if (masks) {
            try {
                const parsed = typeof masks === 'string' ? JSON.parse(masks) : masks;
                setLocalMasks(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
                console.error("Failed to parse masks", e);
                setLocalMasks([]);
            }
        }
    }, [masks]);

    // Fetch snapshot
    useEffect(() => {
        if (cameraId) {
            setSnapshotUrl(`/api/cameras/${cameraId}/frame?raw=true&t=${Date.now()}`);
        }
    }, [cameraId]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const { width, height } = canvas;

        // Draw existing masks
        localMasks.forEach((mask, index) => {
            if (!mask.points || mask.points.length < 2) return;
            
            ctx.beginPath();
            ctx.moveTo(mask.points[0][0] * width, mask.points[0][1] * height);
            for (let i = 1; i < mask.points.length; i++) {
                ctx.lineTo(mask.points[i][0] * width, mask.points[i][1] * height);
            }
            ctx.closePath();
            
            // Fill with semi-transparent color
            ctx.fillStyle = hexToRgba(color, 0.4);
            ctx.fill();
            
            // Stroke
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw point markers
            mask.points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p[0] * width, p[1] * height, 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            });
        });

        // Draw current points (drawing in progress)
        if (currentPoints.length > 0) {
            ctx.beginPath();
            ctx.moveTo(currentPoints[0][0] * width, currentPoints[0][1] * height);
            for (let i = 1; i < currentPoints.length; i++) {
                ctx.lineTo(currentPoints[i][0] * width, currentPoints[i][1] * height);
            }
            
            ctx.strokeStyle = '#3b82f6'; // blue
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            currentPoints.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p[0] * width, p[1] * height, 4, 0, Math.PI * 2);
                ctx.fillStyle = i === 0 ? '#10b981' : '#3b82f6'; // Green for first, blue for others
                ctx.fill();
            });
        }
    }, [localMasks, currentPoints, color]);

    useEffect(() => {
        draw();
    }, [draw]);

    const handleCanvasClick = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Check if clicking near first point to close
        if (currentPoints.length >= 3) {
            const firstPoint = currentPoints[0];
            const dist = Math.sqrt(Math.pow(x - firstPoint[0], 2) + Math.pow(y - firstPoint[1], 2));
            if (dist < 0.03) { // 3% tolerance
                finishPolygon();
                return;
            }
        }

        setCurrentPoints([...currentPoints, [x, y]]);
    };

    const finishPolygon = () => {
        if (currentPoints.length < 3) return;
        const newMasks = [...localMasks, { points: currentPoints }];
        setLocalMasks(newMasks);
        setCurrentPoints([]);
        onChange(JSON.stringify(newMasks));
    };

    const deleteMask = (index) => {
        const newMasks = localMasks.filter((_, i) => i !== index);
        setLocalMasks(newMasks);
        onChange(JSON.stringify(newMasks));
    };

    const resetCurrent = () => {
        setCurrentPoints([]);
    };

    const handleImageLoad = (e) => {
        setImgSize({ width: e.target.naturalWidth, height: e.target.naturalHeight });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        {label}
                        <span className="text-[10px] font-normal bg-primary/10 text-primary px-1.5 py-0.5 rounded leading-none">
                            {localMasks.length} Zones
                        </span>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {description}
                    </p>
                </div>
                <div className="flex gap-2">
                    {currentPoints.length > 0 && (
                        <>
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={resetCurrent}
                                className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                                <X className="w-3.5 h-3.5 mr-1" /> Clear
                            </Button>
                            <Button 
                                type="button" 
                                variant="secondary" 
                                size="sm" 
                                onClick={finishPolygon}
                                disabled={currentPoints.length < 3}
                                className="h-8 text-xs"
                            >
                                <Check className="w-3.5 h-3.5 mr-1" /> Finish
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div 
                ref={containerRef}
                className="relative bg-black rounded-lg overflow-hidden border border-border shadow-inner cursor-crosshair group"
                style={{ aspectRatio: imgSize.width ? `${imgSize.width}/${imgSize.height}` : '16/9' }}
            >
                {snapshotUrl ? (
                    <img 
                        src={snapshotUrl} 
                        alt="Camera Snapshot" 
                        onLoad={handleImageLoad}
                        className="w-full h-full object-contain pointer-events-none select-none"
                        onError={() => setSnapshotUrl('')}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted/20 text-muted-foreground space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                        <span className="text-sm">Loading Snapshot...</span>
                    </div>
                )}
                
                <canvas 
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    width={containerRef.current?.clientWidth || 800}
                    height={containerRef.current?.clientHeight || 450}
                    className="absolute inset-0 w-full h-full"
                />

                {/* Instructions Overlay (Visible on hover or if empty) */}
                {(localMasks.length === 0 && currentPoints.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <div className="bg-background/90 p-4 rounded-xl border border-border shadow-2xl text-center max-w-[250px]">
                            <MousePointer2 className="w-8 h-8 mx-auto mb-3 text-primary opacity-50" />
                            <p className="text-sm font-bold">Start Drawing</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Click on the image to place points. Connect back to the first point to close the area.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Hint */}
            {hint && (
                <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg text-[11px] text-muted-foreground">
                    <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="leading-relaxed whitespace-pre-line">
                        {hint}
                    </div>
                </div>
            )}

            {/* List of masks */}
            {localMasks.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                    {localMasks.map((mask, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 pl-3 bg-muted/30 border border-border rounded-lg group hover:border-primary/30 transition-colors">
                            <span className="text-xs font-medium">Zone #{idx + 1} ({mask.points.length} points)</span>
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => deleteMask(idx)}
                                className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                                <Trash2 className="w-5 h-5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
