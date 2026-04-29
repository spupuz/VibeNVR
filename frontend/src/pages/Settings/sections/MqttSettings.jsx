import React from 'react';
import { Share2, Terminal } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, Toggle } from '../../../components/ui/FormControls';

export const MqttSettings = ({
    globalSettings,
    setGlobalSettings,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="mqtt"
            title="MQTT Service"
            description="Integration with Home Assistant via MQTT Discovery"
            icon={<Share2 className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6">
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Broker Configuration</h4>
                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${ (globalSettings.mqtt_enabled === "true" || globalSettings.mqtt_enabled === true) ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                             <span className="text-[10px] uppercase font-bold tracking-tighter opacity-50">
                                { (globalSettings.mqtt_enabled === "true" || globalSettings.mqtt_enabled === true) ? 'Service Active' : 'Service Disabled'}
                             </span>
                        </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        <span className="font-semibold text-primary">Home Assistant:</span> When enabled, VibeNVR will automatically publish discovery messages. Your cameras will appear as new devices in Home Assistant with motion and status sensors.
                    </p>

                    <div className="mb-6">
                        <Toggle
                            label="Enable MQTT Service"
                            checked={globalSettings.mqtt_enabled === "true" || globalSettings.mqtt_enabled === true}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_enabled: val ? "true" : "false" })}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField
                            label="Broker Host"
                            placeholder="192.168.1.50"
                            value={globalSettings.mqtt_host}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_host: val })}
                            help="IP address or hostname of your MQTT broker"
                        />
                        <InputField
                            label="Broker Port"
                            placeholder="1883"
                            value={globalSettings.mqtt_port}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_port: val })}
                        />
                        <InputField
                            label="Username"
                            placeholder="mqtt_user"
                            value={globalSettings.mqtt_username}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_username: val })}
                            help="Optional"
                        />
                        <InputField
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={globalSettings.mqtt_password}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_password: val })}
                            help="Optional"
                        />
                        <InputField
                            label="Topic Prefix"
                            placeholder="vibenvr"
                            value={globalSettings.mqtt_topic_prefix}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, mqtt_topic_prefix: val })}
                            help="Default: vibenvr"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Terminal className="w-4 h-4 opacity-50" />
                        Topic Structure
                    </h4>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border/40 font-mono text-[10px] space-y-1 text-muted-foreground">
                        <p>{globalSettings.mqtt_topic_prefix || 'vibenvr'}/[camera_id]/motion → ON/OFF</p>
                        <p>{globalSettings.mqtt_topic_prefix || 'vibenvr'}/[camera_id]/status → online/offline</p>
                        <p>{globalSettings.mqtt_topic_prefix || 'vibenvr'}/[camera_id]/attributes → AI Metadata (JSON)</p>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
