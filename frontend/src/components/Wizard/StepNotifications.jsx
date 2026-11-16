import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Send, Loader2, Radio, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export const StepNotifications = ({ notifications, setNotifications }) => {
    const { t } = useTranslation();
    const { token } = useAuth();
    const { showToast } = useToast();
    const [testing, setTesting] = useState(false);
    const [showApprise, setShowApprise] = useState(false);

    const handleTestNotification = async () => {
        if (!notifications.apprise_urls?.trim()) {
            showToast(t('wizard.notify.enter_url', 'Enter an Apprise URL first'), 'error');
            return;
        }
        setTesting(true);
        try {
            const res = await fetch('/api/settings/test-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({ url: notifications.apprise_urls.trim() })
            });
            if (!res.ok) throw new Error('Test failed');
            showToast(t('wizard.notify.test_sent', 'Test notification sent!'), 'success');
        } catch (err) {
            showToast(t('wizard.notify.test_failed', 'Failed to send test notification'), 'error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-1">{t('wizard.notify.title', 'Notifications & Integrations')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('wizard.notify.subtitle', 'Set up motion alerts via Apprise (Telegram, Discord, Email, etc.) or MQTT for Home Assistant.')}
                </p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    {t('wizard.notify.apprise_url', 'Apprise Notification URL')}
                </label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type={showApprise ? 'text' : 'password'}
                            placeholder="tgram://bottoken/ChatID or discord://webhook_id/webhook_token"
                            value={notifications.apprise_urls}
                            onChange={(e) => setNotifications(prev => ({ ...prev, apprise_urls: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApprise(s => !s)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Toggle visibility"
                        >
                            {showApprise ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <button
                        type="button"
                        disabled={testing}
                        onClick={handleTestNotification}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-accent text-sm font-medium disabled:opacity-50"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {t('wizard.notify.test_btn', 'Test')}
                    </button>
                </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{t('wizard.notify.mqtt_enable', 'Enable MQTT (Home Assistant)')}</span>
                    </div>
                    <input
                        type="checkbox"
                        checked={notifications.mqtt_enabled}
                        onChange={(e) => setNotifications(prev => ({ ...prev, mqtt_enabled: e.target.checked }))}
                        className="w-5 h-5 accent-primary cursor-pointer"
                    />
                </div>

                {notifications.mqtt_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <input
                            type="text"
                            placeholder={t('wizard.notify.mqtt_host', 'Broker Host (e.g. 192.168.1.50)')}
                            value={notifications.mqtt_host}
                            onChange={(e) => setNotifications(prev => ({ ...prev, mqtt_host: e.target.value }))}
                            className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                            type="number"
                            placeholder="1883"
                            value={notifications.mqtt_port}
                            onChange={(e) => setNotifications(prev => ({ ...prev, mqtt_port: e.target.value }))}
                            className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                <div>
                    <p className="text-sm font-medium">{t('wizard.notify.ai_enable', 'Enable AI / Smart Detection')}</p>
                    <p className="text-xs text-muted-foreground">
                        {t('wizard.notify.ai_hint', 'Detect people and vehicles in motion events (requires AI model).')}
                    </p>
                </div>
                <input
                    type="checkbox"
                    checked={notifications.ai_enabled}
                    onChange={(e) => setNotifications(prev => ({ ...prev, ai_enabled: e.target.checked }))}
                    className="w-5 h-5 accent-primary cursor-pointer"
                />
            </div>
        </div>
    );
};
