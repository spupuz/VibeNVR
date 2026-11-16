import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Coffee, Heart, X } from 'lucide-react';

const STORAGE_KEY = 'vibenvr_support_prompt_last_seen';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const SupportModal = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const now = Date.now();
            if (!raw) {
                localStorage.setItem(STORAGE_KEY, String(now));
                return;
            }
            const lastSeen = Number(raw);
            if (!Number.isNaN(lastSeen) && now - lastSeen >= SEVEN_DAYS_MS) {
                setIsOpen(true);
            }
        } catch {
            // Ignore storage access errors
        }
    }, []);

    const handleClose = () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
            // Ignore storage access errors
        }
        setIsOpen(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
                <button
                    type="button"
                    onClick={handleClose}
                    aria-label={t('common.close', 'Close')}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500">
                        <Heart className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold">
                        {t('support_modal.title', 'Enjoying VibeNVR?')}
                    </h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(
                        'support_modal.message',
                        'If you like this project and find it useful, please consider supporting its development with a small donation. Even a little bit helps keep it going!'
                    )}
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
                    >
                        {t('support_modal.later', 'Maybe later')}
                    </button>
                    <a
                        href="https://www.buymeacoffee.com/spupuz"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleClose}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors"
                    >
                        <Coffee className="w-4 h-4" />
                        {t('support_modal.donate', 'Buy Me a Coffee')}
                    </a>
                </div>
            </div>
        </div>
    );
};
