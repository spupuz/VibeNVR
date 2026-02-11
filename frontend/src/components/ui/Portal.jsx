import { createPortal } from 'react-dom';

/**
 * Reusable Portal component to render children into document.body.
 * This escapes the stacking context of parent components.
 */
export const Portal = ({ children }) => {
    return createPortal(children, document.body);
};
