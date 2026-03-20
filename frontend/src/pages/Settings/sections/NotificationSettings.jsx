import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { InputField, Toggle } from '../../../components/ui/FormControls';

export const NotificationSettings = ({
    globalSettings,
    setGlobalSettings,
    handleTestNotify,
    isOpen,
    onToggle
}) => {
    return (
        <CollapsibleSection
            id="notifications"
            title="Notification Settings"
            description="Configure global Email and Telegram credentials"
            icon={<Bell className="w-6 h-6" />}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            <div className="space-y-6">
                {/* SMTP Section */}
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">SMTP (Email) Configuration</h4>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleTestNotify('email')}
                            className="h-11 sm:h-9 w-full sm:w-auto text-xs px-5 shadow-sm active:scale-95"
                        >
                            <Bell className="w-4 h-4 mr-2 opacity-60" />
                            Test Email
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                        <span className="font-semibold text-primary">Note:</span> These global credentials will be used for all cameras unless a camera specifically overrides them in its own settings.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField
                            label="SMTP Server"
                            placeholder="smtp.gmail.com"
                            value={globalSettings.smtp_server}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, smtp_server: val })}
                        />
                        <InputField
                            label="SMTP Port"
                            placeholder="587"
                            value={globalSettings.smtp_port}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, smtp_port: val })}
                        />
                        <InputField
                            label="Username"
                            placeholder="user@example.com"
                            value={globalSettings.smtp_username}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, smtp_username: val })}
                        />
                        <InputField
                            label="Password"
                            type="password"
                            placeholder="App Password"
                            value={globalSettings.smtp_password}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, smtp_password: val })}
                        />
                        <InputField
                            label="Sender Email ('From')"
                            type="email"
                            placeholder="nvr@yourdomain.com"
                            value={globalSettings.smtp_from_email}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, smtp_from_email: val })}
                        />
                        <InputField
                            label="Default Email Recipient ('To')"
                            type="email"
                            placeholder="admin@example.com"
                            help="Fallback if camera recipient is not set"
                            value={globalSettings.notify_email_recipient}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, notify_email_recipient: val })}
                        />
                    </div>
                </div>

                {/* Telegram Section */}
                <div className="pt-6 border-t border-border/50 mt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Telegram Configuration</h4>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleTestNotify('telegram')}
                            className="h-11 sm:h-9 w-full sm:w-auto text-xs px-5 shadow-sm active:scale-95"
                        >
                            <Bell className="w-4 h-4 mr-2 opacity-60" />
                            Test Telegram
                        </Button>
                    </div>
                    <div className="space-y-4">
                        <InputField
                            label="Bot Token"
                            type="password"
                            placeholder="123456:ABC-DEF..."
                            value={globalSettings.telegram_bot_token}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, telegram_bot_token: val })}
                            help="Global Default. Can be overridden per camera."
                        />
                        <InputField
                            label="Global Chat ID"
                            placeholder="-100123456789"
                            value={globalSettings.telegram_chat_id}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, telegram_chat_id: val })}
                            help="Default destination for all cameras. Specific cameras can override this."
                        />
                    </div>
                </div>

                {/* Webhook Section */}
                <div className="pt-6 border-t border-border/50 mt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Webhook Configuration</h4>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleTestNotify('webhook')}
                            className="h-11 sm:h-9 w-full sm:w-auto text-xs px-5 shadow-sm active:scale-95"
                        >
                            <Bell className="w-4 h-4 mr-2 opacity-60" />
                            Test Webhook
                        </Button>
                    </div>
                    <InputField
                        label="Global Webhook URL"
                        placeholder="https://homeassistant.local/api/webhook/..."
                        value={globalSettings.notify_webhook_url}
                        onChange={(val) => setGlobalSettings({ ...globalSettings, notify_webhook_url: val })}
                        help="Global Default. Used if a camera doesn't specify a webhook."
                    />
                </div>

                {/* Defaults section inside Notifications */}
                <div className="pt-4 border-t border-border/50">
                    <h4 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Attachment Defaults</h4>

                    <div className="mt-4 space-y-4">
                        <Toggle
                            label="Attach Snapshot to Email (Global)"
                            checked={globalSettings.global_attach_image_email}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, global_attach_image_email: val })}
                        />
                        <Toggle
                            label="Attach Snapshot to Telegram (Global)"
                            checked={globalSettings.global_attach_image_telegram}
                            onChange={(val) => setGlobalSettings({ ...globalSettings, global_attach_image_telegram: val })}
                        />
                        <p className="text-[10px] text-muted-foreground">Default behavior for image attachments in notifications</p>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
