import React, { createContext, useContext } from 'react';
import { getSharedDoc, getSharedProvider } from './collaboration';

const CollabContext = createContext({ 
  doc: getSharedDoc(), 
  provider: getSharedProvider() 
});

export const CollabProvider = ({ children }) => (
  <CollabContext.Provider value={{ doc, provider }}>
    {children}
  </CollabContext.Provider>
);

export const useCollab = () => useContext(CollabContext);