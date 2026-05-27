import React from 'react';
import { useTranslation } from 'react-i18next';
import { Key } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { ApiTokenManager } from '../../../components/ApiTokenManager';

export const ApiTokenSettings = ({
    isOpen,
    onToggle
}) => {
    const { t } = useTranslation();
    return (
        <ApiTokenManager 
            isOpen={isOpen}
            onToggle={onToggle}
        />
    );
};
