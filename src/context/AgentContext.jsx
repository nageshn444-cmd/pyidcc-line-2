import React, { createContext, useState, useEffect, useCallback } from 'react';
import { discoverAgents } from '../components/AgentDiscoveryService';

export const AgentContext = createContext({
  agents: [],
  refreshAgents: () => {}
});

export const AgentProvider = ({ children }) => {
  const [agents, setAgents] = useState([]);

  const refreshAgents = useCallback(async () => {
    try {
      const discovered = await discoverAgents();
      setAgents(discovered);
    } catch (e) {
      console.error('Agent discovery failed', e);
    }
  }, []);

  // Initial load and periodic refresh (30 seconds)
  useEffect(() => {
    refreshAgents();
    const interval = setInterval(refreshAgents, 30_000);
    return () => clearInterval(interval);
  }, [refreshAgents]);

  return (
    <AgentContext.Provider value={{ agents, refreshAgents }}>
      {children}
    </AgentContext.Provider>
  );
};
