import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useTranslation } from 'react-i18next';

export const FederationContext = createContext(null);

export const FederationProvider = ({ children }) => {
    const { token } = useAuth();
    const { showToast } = useToast();
    const { t } = useTranslation();
    const [activeNode, setActiveNodeState] = useState(() => {
        const stored = localStorage.getItem('vibenvr_active_node') || null;
        window.__ACTIVE_NODE_ID = stored;
        return stored;
    });
    const [nodes, setNodes] = useState([]);

    const setActiveNode = (node) => {
        window.__ACTIVE_NODE_ID = node;
        setActiveNodeState(node);
        if (node) {
            localStorage.setItem('vibenvr_active_node', node);
        } else {
            localStorage.removeItem('vibenvr_active_node');
        }
    };

    // Load nodes periodically to check health
    useEffect(() => {
        if (!token) return;
        
        const loadNodes = () => {
            fetch('/api/federation/nodes', {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => {
                    if (res.ok) return res.json();
                    return [];
                })
                .then(data => {
                    setNodes(data);
                    const currNodeId = window.__ACTIVE_NODE_ID;
                    if (currNodeId) {
                        const current = data.find(n => n.id.toString() === currNodeId.toString());
                        if (current && current.status !== 'online') {
                            showToast(t('federation.node_went_offline', 'The active node went offline. Switching to Master.'), 'error');
                            setActiveNode(null);
                        }
                    }
                })
                .catch(err => console.error("Failed to load federated nodes", err));
        };

        loadNodes();
        const interval = setInterval(loadNodes, 15000); // Check every 15s
        return () => clearInterval(interval);
    }, [token]);

    return (
        <FederationContext.Provider value={{ activeNode, setActiveNode, nodes }}>
            {children}
        </FederationContext.Provider>
    );
};

export const useFederation = () => useContext(FederationContext);
