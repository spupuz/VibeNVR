import React from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../contexts/ToastContext';

export const CopyButton = ({ textToCopy, className = '', ...props }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        copyToClipboard(textToCopy, showToast);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            size="sm"
            variant="ghost"
            title={t('common.copy', 'Copy')}
            aria-label={t('common.copy', 'Copy')}
            onClick={handleCopy}
            className={className}
            {...props}
        >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </Button>
    );
};
