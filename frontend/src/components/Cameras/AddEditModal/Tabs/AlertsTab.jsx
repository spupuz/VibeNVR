import React from 'react';
import { Toggle, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';

export const AlertsTab = ({ newCamera, setNewCamera, handleTestNotification }) => {
    return (
        <div className="space-y-8">
            {/* Email Section */}
            <div className="space-y-4">
                <SectionHeader title="Email Notifications" description="Send alerts via SMTP Email" />

                {/* Motion Email */}
                <div className="space-y-3">
                    <Toggle
                        label="Send Email on Start"
                        checked={newCamera.notify_start_email}
                        onChange={(val) => setNewCamera({ ...newCamera, notify_start_email: val })}
                    />
                    {newCamera.notify_start_email && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border space-y-3 animate-in fade-in slide-in-from-top-1">
                            <InputField
                                label="Recipient"
                                value={newCamera.notify_email_address}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_email_address: val })}
                                placeholder="Leave empty to use Global Settings"
                            />
                            <Toggle
                                label="Attach Snapshot Image"
                                checked={newCamera.notify_attach_image_email !== false}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_attach_image_email: val })}
                                compact={true}
                            />
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('email', { recipient: newCamera.notify_email_address })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Email
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Health Email */}
                <div className="space-y-3">
                    <Toggle
                        label="Notify Health via Email"
                        checked={newCamera.notify_health_email}
                        onChange={(val) => setNewCamera({ ...newCamera, notify_health_email: val })}
                    />
                    {newCamera.notify_health_email && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                            <InputField
                                label="Health Recipient"
                                value={newCamera.notify_health_email_recipient}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_health_email_recipient: val })}
                                placeholder="Leave empty to use Global Settings"
                            />
                            <div className="flex justify-end mt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('email', { recipient: newCamera.notify_health_email_recipient })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Health Email
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Telegram Section */}
            <div className="space-y-4">
                <SectionHeader title="Telegram Notifications" description="Send alerts via Telegram Bot" />

                {/* Motion Telegram */}
                <div className="space-y-3">
                    <Toggle
                        label="Send Telegram Message"
                        checked={newCamera.notify_start_telegram}
                        onChange={(val) => setNewCamera({ ...newCamera, notify_start_telegram: val })}
                    />
                    {newCamera.notify_start_telegram && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border space-y-3 animate-in fade-in slide-in-from-top-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <InputField
                                    label="Bot Token"
                                    value={newCamera.notify_telegram_token}
                                    onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_token: val })}
                                    placeholder="Global Default"
                                />
                                <InputField
                                    label="Chat ID"
                                    value={newCamera.notify_telegram_chat_id}
                                    onChange={(val) => setNewCamera({ ...newCamera, notify_telegram_chat_id: val })}
                                    placeholder="Global Default"
                                />
                            </div>
                            <Toggle
                                label="Attach Snapshot Image"
                                checked={newCamera.notify_attach_image_telegram !== false}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_attach_image_telegram: val })}
                                compact={true}
                            />
                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('telegram', {
                                        telegram_bot_token: newCamera.notify_telegram_token,
                                        telegram_chat_id: newCamera.notify_telegram_chat_id
                                    })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Telegram
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Health Telegram */}
                <div className="space-y-3">
                    <Toggle
                        label="Notify Health via Telegram"
                        checked={newCamera.notify_health_telegram}
                        onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram: val })}
                    />
                    {newCamera.notify_health_telegram && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <InputField
                                    label="Health Bot Token"
                                    value={newCamera.notify_health_telegram_token}
                                    onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram_token: val })}
                                    placeholder="Global Default"
                                />
                                <InputField
                                    label="Health Chat ID"
                                    value={newCamera.notify_health_telegram_chat_id}
                                    onChange={(val) => setNewCamera({ ...newCamera, notify_health_telegram_chat_id: val })}
                                    placeholder="Global Default"
                                />
                            </div>
                            <div className="flex justify-end mt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('telegram', {
                                        telegram_bot_token: newCamera.notify_health_telegram_token,
                                        telegram_chat_id: newCamera.notify_health_telegram_chat_id
                                    })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Health Telegram
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Webhook Section */}
            <div className="space-y-4">
                <SectionHeader title="Webhook Notifications" description="Call external URL on events" />

                {/* Motion Webhook */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-2">
                        <Toggle
                            label="Call Webhook on Start"
                            checked={newCamera.notify_start_webhook}
                            onChange={(val) => setNewCamera({ ...newCamera, notify_start_webhook: val })}
                        />
                        <Toggle
                            label="Call Webhook on End"
                            checked={newCamera.notify_end_webhook}
                            onChange={(val) => setNewCamera({ ...newCamera, notify_end_webhook: val })}
                        />
                    </div>
                    {(newCamera.notify_start_webhook || newCamera.notify_end_webhook) && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                            <InputField
                                label="Webhook URL"
                                value={newCamera.notify_webhook_url}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_webhook_url: val })}
                                placeholder="Leave empty to use Global Settings"
                            />
                            <div className="flex justify-end mt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('webhook', { notify_webhook_url: newCamera.notify_webhook_url })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Webhook
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Health Webhook */}
                <div className="space-y-3">
                    <Toggle
                        label="Notify Health via Webhook"
                        checked={newCamera.notify_health_webhook}
                        onChange={(val) => setNewCamera({ ...newCamera, notify_health_webhook: val })}
                    />
                    {newCamera.notify_health_webhook && (
                        <div className="ml-9 p-3 bg-muted/30 rounded-lg border border-border animate-in fade-in slide-in-from-top-1">
                            <InputField
                                label="Health Webhook URL"
                                value={newCamera.notify_health_webhook_url}
                                onChange={(val) => setNewCamera({ ...newCamera, notify_health_webhook_url: val })}
                                placeholder="Leave empty to use Global Settings"
                            />
                            <div className="flex justify-end mt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTestNotification('webhook', { notify_webhook_url: newCamera.notify_health_webhook_url })}
                                    className="h-8 text-xs font-medium"
                                >
                                    Test Health Webhook
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
