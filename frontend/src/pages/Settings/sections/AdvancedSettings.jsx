import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, SelectField, Toggle } from '../../../components/ui/FormControls';

export const AdvancedSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    return (
        <CollapsibleSection
            id="advanced"
            title={t('settings_advancedsettings.title', 'Advanced Optimization')}
            description={t('settings_advancedsettings.subtitle', 'Fine-tune performance parameters for CPU and Bandwidth control.')}
            icon={<SettingsIcon className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 p-4 rounded-lg text-sm">
                <strong className="flex items-center gap-2">{t('timeline.warning', 'WARNING:')}</strong>
                {t('settings_advancedsettings.warning_desc', 'Changing these values can significantly impact system stability and resource usage. Only modify these if you are experiencing performance issues or running on low-end hardware. Incorrect settings may cause video lag, broken streams, or high CPU usage.')}
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Live View Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-border/50 pb-6">
                    <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">{t('settings_forms.adv_live_fps', 'Live View FPS Throttle (Nth Frame)')}</label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('settings_advancedsettings.live_fps_desc1', 'Adds a background-level throttle to the live stream. Setting this to')} <strong>2</strong> {t('settings_advancedsettings.live_fps_desc2', 'means only every 2nd frame is processed (effective 15fps for 30fps source).')}
                            <br /><br />
                            <span className="text-primary/80 font-medium">{t('timeline.higher_value_less_cpu_usa', 'Higher value = Less CPU usage')}</span>, {t('settings_advancedsettings.choppier_video', 'but choppier video.')}
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-full sm:max-w-[150px] h-11"
                            value={globalSettings.opt_live_view_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_fps_throttle: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-2 font-medium opacity-70">{t('settings_forms.adv_live_fps_def', 'Default: 2 (Process 50% of frames)')}</p>
                    </div>
                </div>

                {/* Motion Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-border/50 pb-6">
                    <div className="md:col-span-1 space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">{t('settings_forms.adv_mot_fps', 'Motion Detection FPS Throttle')}</label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('settings_advancedsettings.motion_fps_desc1', 'Controls how often the motion detection algorithm runs. Setting this to')} <strong>3</strong> {t('settings_advancedsettings.motion_fps_desc2', 'means motion is only checked every 3rd frame.')}
                            <br /><br />
                            <span className="text-primary/80 font-medium">{t('timeline.higher_value_much_less_cp', 'Higher value = Much Less CPU usage')}</span>.
                            {t('settings_advancedsettings.values_over_5', 'Values > 5 may miss fast objects.')}
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-full sm:max-w-[150px] h-11"
                            value={globalSettings.opt_motion_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_motion_fps_throttle: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-2 font-medium opacity-70">{t('settings_forms.adv_mot_fps_def', 'Default: 3 (Process 33% of frames)')}</p>
                    </div>
                </div>

                {/* Pre-Capture Throttling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_pre_cap', 'Pre-Capture Buffer FPS divisor')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.pre_cap_desc1', 'Reduces the RAM usage of the pre-trigger buffer by storing fewer frames. Setting this to')} <strong>2</strong> {t('settings_advancedsettings.pre_cap_desc2', 'means only every 2nd frame is buffered (saving 50% RAM), but early seconds of recording will be less fluid.')}
                            <br /><br />
                            <strong>{t('timeline.higher_value_less_ram_usa', 'Higher value = Less RAM usage')}</strong>.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_pre_capture_fps_throttle}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_pre_capture_fps_throttle: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_pre_cap_def', 'Default: 1 (Full FPS)')}</p>
                    </div>
                </div>

                {/* Live View Height */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_lv_res', 'Live View Resolution Limit (Height)')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.lv_res_desc', "If a camera's resolution is higher than this (e.g. 1080p), it will be downscaled for the Live View stream in the browser. Recording quality is NOT affected.")}
                            <br /><br />
                            <strong>{t('timeline.lower_value_e_g_480_or_72', 'Lower value (e.g. 480 or 720) = Much Lower Bandwidth & CPU')}</strong>.
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_live_view_height_limit}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_height_limit: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_lv_res_def', 'Default: 720 (720p)')}</p>
                    </div>
                </div>

                {/* Motion Analysis Height */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_mot_res', 'Motion Analysis Resolution (Height)')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.mot_res_desc1', 'Internal resolution used')} <i>{t('timeline.strictly', 'strictly')}</i> {t('settings_advancedsettings.mot_res_desc2', 'for detecting motion. Does not affect recording or live view. The engine resizes the frame to this height before comparing pixels.')}
                            <br /><br />
                            <strong>{t('timeline.smaller_faster_cpu_proces', 'Smaller = Faster CPU processing')}</strong>.
                            {t('settings_advancedsettings.mot_res_desc3', '180px is usually enough for human detection.')}
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_motion_analysis_height}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_motion_analysis_height: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_mot_res_def', 'Default: 180 (Very Low Res)')}</p>
                    </div>
                </div>

                {/* Live View Quality */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_lv_q', 'Live View JPEG Quality')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.lv_q_desc1', 'Compression level for the specific Live View stream.')}
                            <br /><br />
                            <strong>{t('timeline.lower_e_g_50_60_less_band', 'Lower (e.g. 50-60) = Less Bandwidth')}</strong>, {t('settings_advancedsettings.lv_q_desc2', 'faster loading.')}
                            <strong>{t('timeline.higher_90_better_looking', 'Higher (90+) = Better looking live view')}</strong> {t('settings_advancedsettings.lv_q_desc3', 'but higher bandwidth.')}
                        </p>
                    </div>
                    <div className="md:col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_live_view_quality}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_live_view_quality: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_lv_q_def', 'Default: 60 (Balanced)')}</p>
                    </div>
                </div>

                {/* Snapshot Quality */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-border/50 pb-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_snap_q', 'Events Snapshot Quality')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.snap_q_desc1', 'Quality of the static JPEG images saved during motion events.')}
                            <br /><br />
                            <strong>{t('timeline.higher_clearer_images', 'Higher = Clearer images')}</strong> {t('settings_advancedsettings.snap_q_desc2', 'for identification.')}
                        </p>
                    </div>
                    <div className="col-span-2">
                        <InputField
                            type="number"
                            className="max-w-[150px]"
                            value={globalSettings.opt_snapshot_quality}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_snapshot_quality: val })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_snap_q_def', 'Default: 90 (High Quality)')}</p>
                    </div>
                </div>

                {/* FFMPEG Preset */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_ffmpeg_pre', 'FFMPEG Transcoding Preset')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.ffmpeg_desc1', 'Determines how much CPU FFMPEG uses to compress video when transcoding is required (not using Passthrough).')}
                            <br /><br />
                            <strong>{t('timeline.ultrafast_lowest_cpu_usag', 'Ultrafast = Lowest CPU usage')}</strong>, {t('settings_advancedsettings.ffmpeg_desc2', 'but larger file sizes or lower quality.')}
                            <strong>{t('timeline.medium_high_cpu_usage', 'Medium = High CPU usage')}</strong>, {t('settings_advancedsettings.ffmpeg_desc3', 'smaller file sizes.')}
                        </p>
                    </div>
                    <div className="col-span-2">
                        <SelectField
                            className="max-w-[200px]"
                            value={globalSettings.opt_ffmpeg_preset}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_ffmpeg_preset: val })}
                            options={[
                                { value: 'ultrafast', label: t('settings_forms.ffmpeg_ultrafast', 'Ultrafast (Best for CPU)') },
                                { value: 'superfast', label: t('settings_forms.ffmpeg_superfast', 'Superfast') },
                                { value: 'veryfast', label: t('settings_forms.ffmpeg_veryfast', 'Veryfast') },
                                { value: 'faster', label: t('settings_forms.ffmpeg_faster', 'Faster') },
                                { value: 'fast', label: t('settings_forms.ffmpeg_fast', 'Fast') },
                                { value: 'medium', label: t('settings_forms.ffmpeg_medium', 'Medium (Standard)') },
                                { value: 'slow', label: t('settings_forms.ffmpeg_slow', 'Slow (High CPU)') }
                            ]}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{t('settings_forms.adv_ffmpeg_def', 'Default: Ultrafast')}</p>
                    </div>
                </div>

                {/* Verbose Logs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/50">
                    <div className="col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('settings_forms.adv_verb_logs', 'Verbose Engine Logs')}</label>
                        <p className="text-xs text-muted-foreground">
                            {t('settings_advancedsettings.verb_logs_desc1', 'Enables detailed logs from OpenCV and FFmpeg.')}
                            <br /><br />
                            <strong>{t('timeline.useful_for_debugging_conn', 'Useful for debugging connection issues')}</strong>, {t('settings_advancedsettings.verb_logs_desc2', 'but will clutter the engine logs during normal operation.')}
                        </p>
                    </div>
                    <div className="col-span-2">
                        <Toggle
                            checked={globalSettings.opt_verbose_engine_logs}
                            onChange={val => setGlobalSettings({ ...globalSettings, opt_verbose_engine_logs: val })}
                        />
                        <p className="text-xs text-muted-foreground mt-1 opacity-70 font-medium tracking-tight">{t('settings_forms.adv_off', 'Default: Off')}</p>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
