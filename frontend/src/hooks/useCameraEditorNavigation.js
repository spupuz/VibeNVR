import { useEffect, useRef } from 'react';
import { useBlocker, useBeforeUnload } from 'react-router';
import { useTranslation } from 'react-i18next';

export const useCameraEditorNavigation = (isDirty, isSaving) => {
    const { t } = useTranslation();
    const allowNavigation = useRef(false);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => (
        !allowNavigation.current && (isDirty || isSaving)
        && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
    ));

    useBeforeUnload((event) => {
        if ((isDirty || isSaving) && !allowNavigation.current) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    useEffect(() => {
        if (blocker.state === 'blocked' && (!isDirty || isSaving)) blocker.reset();
    }, [blocker, isDirty, isSaving]);

    useEffect(() => {
        const beforeNodeChange = (event) => {
            if (isSaving || (isDirty && event.detail?.automatic)) {
                event.preventDefault();
                return;
            }
            if (isDirty && !window.confirm(t('camera_editor.discard_message', 'You have unsaved camera changes. Leave without saving?'))) event.preventDefault();
        };
        window.addEventListener('vibenvr:before-node-change', beforeNodeChange);
        return () => window.removeEventListener('vibenvr:before-node-change', beforeNodeChange);
    }, [isDirty, isSaving, t]);

    return { blocker, allowNavigation };
};
