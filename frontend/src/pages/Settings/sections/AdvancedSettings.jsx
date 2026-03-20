import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, SelectField, Toggle } from '../../../components/ui/FormControls';

export const AdvancedSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="advanced"
            title="Advanced Optimization"
            description="Fine-tune performance parameters for CPU and Bandwidth control."
            icon={<SettingsIcon className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 p-4 rounded-lg text-sm">
                <strong className="flex items-center gap-2">WARNING:</strong>
                Changing these values can significantly impact system stability and resource usage.
                Only modify these if you are experiencing performance issues or running on low-end hardware.
                Incorrect settings may cause video lag, broken streams, or high CPU usage.
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Live View Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-border/50 pb-6">
                    <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Live View FPS Throttle (Nth Frame)</label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Adds a background-level throttle to the live stream.
                            Setting this to <strong>2</strong> means only every 2nd frame is processed (effective 15fps for 30fps source).
                            <br /><br />
                            <span className="text-primary/80 font-medium">Higher value = Less CPU usage</span>, but choppier video.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-full sm:max-w-[150px] h-11"
                            value={globalSettings.opt_live_view_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_fps_throttle: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-2 font-medium opacity-70">Default: 2 (Process 50% of frames)</p>
                    </div>
                </div>

                {/* Motion Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-border/50 pb-6">
                    <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Motion Detection FPS Throttle</label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Controls how often the motion detection algorithm runs.
                            Setting this to <strong>3</strong> means motion is only checked every 3rd frame.
                            <br /><br />
                            <span className="text-primary/80 font-medium">Higher value = Much Less CPU usage</span>.
                            Values &gt; 5 may miss fast objects.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-full sm:max-w-[150px] h-11"
                            value={globalSettings.opt_motion_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_motion_fps_throttle: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-2 font-medium opacity-70">Default: 3 (Process 33% of frames)</p>
                    </div>
                </div>

                {/* Pre-Capture Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">Pre-Capture Buffer FPS divisor</label>
                        <p className="text-xs text-muted-foreground">
                            Reduces the RAM usage of the pre-trigger buffer by storing fewer frames.
                            Setting this to <strong>2</strong> means only every 2nd frame is buffered (saving 50% RAM), but early seconds of recording will be less fluid.
                            <br /><br />
                            <strong>Higher value = Less RAM usage</strong>.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_pre_capture_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_pre_capture_fps_throttle: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: 1 (Full FPS)</p>
                    </div>
                </div>

                {/* Live View Height */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">Live View Resolution Limit (Height)</label>
                        <p className="text-xs text-muted-foreground">
                            If a camera's resolution is higher than this (e.g. 1080p), it will be downscaled for the Live View stream in the browser.
                            Recording quality is NOT affected.
                            <br /><br />
                            <strong>Lower value (e.g. 480 or 720) = Much Lower Bandwidth & CPU</strong>.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_live_view_height_limit}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_height_limit: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: 720 (720p)</p>
                    </div>
                </div>

                {/* Motion Analysis Height */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">Motion Analysis Resolution (Height)</label>
                        <p className="text-xs text-muted-foreground">
                            Internal resolution used <i>strictly</i> for detecting motion. Does not affect recording or live view.
                            The engine resizes the frame to this height before comparing pixels.
                            <br /><br />
                            <strong>Smaller = Faster CPU processing</strong>.
                            180px is usually enough for human detection.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_motion_analysis_height}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_motion_analysis_height: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: 180 (Very Low Res)</p>
                    </div>
                </div>

                {/* Live View Quality */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">Live View JPEG Quality</label>
                        <p className="text-xs text-muted-foreground">
                            Compression level for the specific Live View stream.
                            <br /><br />
                            <strong>Lower (e.g. 50-60) = Less Bandwidth</strong>, faster loading.
                            <strong>Higher (90+) = Better looking live view</strong> but higher bandwidth.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_live_view_quality}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_quality: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: 60 (Balanced)</p>
                    </div>
                </div>

                {/* Snapshot Quality */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">Events Snapshot Quality</label>
                        <p className="text-xs text-muted-foreground">
                            Quality of the static JPEG images saved during motion events.
                            <br /><br />
                            <strong>Higher = Clearer images</strong> for identification.
                        </p>
                    </div>
                    <div className="col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_snapshot_quality}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_snapshot_quality: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: 90 (High Quality)</p>
                    </div>
                </div>

                {/* FFMPEG Preset */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">FFMPEG Transcoding Preset</label>
                        <p className="text-xs text-muted-foreground">
                            Determines how much CPU FFMPEG uses to compress video when transcoding is required (not using Passthrough).
                            <br /><br />
                            <strong>Ultrafast = Lowest CPU usage</strong>, but larger file sizes or lower quality.
                            <strong>Medium = High CPU usage</strong>, smaller file sizes.
                        </p>
                    </div>
                    <div className="col-span-2">
                        <SelectField
                            className="max-w-[200px]"
                            value={globalSettings.opt_ffmpeg_preset}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_ffmpeg_preset: val })}
                            options={[
                                { value: 'ultrafast', label: 'Ultrafast (Best for CPU)' },
                                { value: 'superfast', label: 'Superfast' },
                                { value: 'veryfast', label: 'Veryfast' },
                                { value: 'faster', label: 'Faster' },
                                { value: 'fast', label: 'Fast' },
                                { value: 'medium', label: 'Medium (Standard)' },
                                { value: 'slow', label: 'Slow (High CPU)' }
                            ]}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Default: Ultrafast</p>
                    </div>
                </div>

                {/* Verbose Logs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/50">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">Verbose Engine Logs</label>
                        <p className="text-xs text-muted-foreground">
                            Enables detailed logs from OpenCV and FFmpeg.
                            <br /><br />
                            <strong>Useful for debugging connection issues</strong>, but will clutter the engine logs during normal operation.
                        </p>
                    </div>
                    <div className="col-span-2">
                        <Toggle
                            checked={globalSettings.opt_verbose_engine_logs}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_verbose_engine_logs: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-1 opacity-70 font-medium tracking-tight">Default: Off</p>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
