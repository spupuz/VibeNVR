import React from 'react';
import { Monitor, Send, LayoutDashboard } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { Toggle, SelectField } from '../../../components/ui/FormControls';

export const PrivacySettings = ({
    globalSettings,
    setGlobalSettings,
    handleManualTelemetry,
    isReportingTelemetry,
    isOpen,
    onToggle
}) => {
    const telemetryFields = [
        { field: 'instance_id', example: 'a1b2c3-...', note: 'Random UUID generated at boot' },
        { field: 'version', example: '1.19.1', note: 'Installed VibeNVR version' },
        { field: 'os', example: 'Linux', note: 'Operating system type' },
        { field: 'arch', example: 'x86_64', note: 'CPU architecture' },
        { field: 'cpu', example: '8', note: 'Logical CPU cores' },
        { field: 'cpu_model', example: 'Intel Core...', note: 'Processor commercial name' },
        { field: 'ram', example: '32', note: 'Total system RAM GB' },
        { field: 'gpu', example: 'True/False', note: 'HW acceleration status' },
        { field: 'cameras', example: '4', note: 'Total cameras configured' },
        { field: 'groups', example: '2', note: 'Total camera groups' },
        { field: 'events', example: '1400', note: 'Recorded events in DB' },
        { field: 'notifications', example: 'True/False', note: 'Notification status' },
        { field: 'mqtt_active', example: 'True/False', note: 'MQTT integration status' },
        { field: 'motion_opencv', example: '1', note: 'Cameras using OpenCV engine' },
        { field: 'motion_onvif', example: '0', note: 'Cameras using ONVIF Edge engine' },
        { field: 'motion_ai_engine', example: '1', note: 'Cameras using AI Native engine' },
        { field: 'motion_ai', example: '1', note: 'Cameras with AI layer enabled' },
        { field: 'onvif_count', example: '2', note: 'ONVIF-capable cameras count' },
        { field: 'substream_count', example: '1', note: 'Cameras with sub-streams' },
        { field: 'country', example: 'IT', note: 'Added by Cloudflare' },
    ];

    return (
        <CollapsibleSection
            id="privacy"
            title="Privacy & Analytics"
            description="Control anonymous data sharing"
            icon={<Monitor className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1 space-y-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                        <Toggle
                            label="Enable Anonymous Telemetry"
                            checked={globalSettings.telemetry_enabled}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, telemetry_enabled: val })}
                        />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Helping the development team improve VibeNVR by sharing anonymous usage statistics. No sensitive data is ever collected.
                        </p>

                        {globalSettings.telemetry_enabled && (
                            <div className="pt-4 border-t border-border/50 flex flex-col gap-2">
                                <Button
                                    onClick={handleManualTelemetry}
                                    disabled={isReportingTelemetry}
                                    variant="outline"
                                    className="w-full justify-center h-11 font-bold"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    {isReportingTelemetry ? 'Sending...' : 'Send Report Now'}
                                </Button>
                                <a
                                    href="https://vibenvr-telemetry.spupuz.workers.dev/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 p-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all duration-200 group no-underline min-h-[44px]"
                                >
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <LayoutDashboard className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-bold uppercase tracking-wider leading-none mb-1">Public Analytics</p>
                                        <p className="text-[10px] text-muted-foreground leading-tight font-medium opacity-80">View global usage stats</p>
                                    </div>
                                </a>
                                <p className="text-[10px] text-muted-foreground text-center px-2 font-medium">
                                    Manually trigger a report for testing or view global anonymous statistics.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2 space-y-4">
                        <div>
                            <h4 className="text-sm font-semibold mb-3 mt-4">Data sent (anonymous)</h4>

                            {/* Mobile View */}
                            <div className="grid grid-cols-1 sm:hidden gap-3 px-1">
                                {telemetryFields.map(row => (
                                    <div key={row.field} className="p-3 bg-muted/20 border border-border/50 rounded-xl flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <span className="font-mono text-xs text-primary/80 font-bold uppercase tracking-wider">{row.field}</span>
                                            <span className="text-sm font-semibold">{row.example}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/30 pt-2 opacity-80">
                                            {row.note}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop View */}
                            <div className="hidden sm:block rounded-xl border border-border overflow-hidden text-xs">
                                <table className="w-full">
                                    <thead className="bg-muted/40 text-left">
                                        <tr>
                                            <th className="p-3 font-medium text-muted-foreground w-1/3">Field</th>
                                            <th className="p-3 font-medium text-muted-foreground">Example</th>
                                            <th className="p-3 font-medium text-muted-foreground">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {telemetryFields.map(row => (
                                            <tr key={row.field} className="hover:bg-muted/10">
                                                <td className="p-3 font-mono text-primary/80">{row.field}</td>
                                                <td className="p-3 text-muted-foreground">{row.example}</td>
                                                <td className="p-3 text-muted-foreground">{row.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-xs text-muted-foreground mt-4 font-medium opacity-80 bg-muted/20 p-3 rounded-xl border border-border/50">
                                    No IP addresses, camera names, stream URLs, usernames, or passwords are ever collected.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold mb-3">Destinations</h4>
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-5 rounded-2xl border border-border/50 bg-muted/20 shadow-sm">
                                    <div className="flex items-center justify-between sm:block">
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-green-500/20 text-green-500 dark:text-green-400 shrink-0">PRIMARY</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold">Cloudflare Analytics Engine</p>
                                        <p className="text-xs text-muted-foreground mt-0.5 break-all font-mono opacity-80">vibenvr-telemetry.spupuz.workers.dev</p>
                                        <p className="text-xs text-muted-foreground/90 mt-2 leading-relaxed font-medium">
                                            Fully anonymous — IP is processed by Cloudflare edge and discarded, only the country code is stored.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
