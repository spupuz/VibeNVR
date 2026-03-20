import React from 'react';
import { Key } from 'lucide-react';
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection';
import { ApiTokenManager } from '../../../components/ApiTokenManager';

export const ApiTokenSettings = ({
    isOpen,
    onToggle
}) => {
    return (
        <ApiTokenManager 
            isOpen={isOpen}
            onToggle={onToggle}
        />
    );
};
