import React, { createContext, useContext } from 'react';

/**
 * ReadOnlyContext
 * ---------------
 * When `value` is true, components should hide/disable all edit, delete,
 * save, upload, and create controls — leaving only read (view) access.
 *
 * Usage in a component:
 *   const readOnly = useReadOnly();
 *   {!readOnly && <button onClick={handleEdit}>Edit</button>}
 *
 * Usage in a provider:
 *   <ReadOnlyContext.Provider value={true}>
 *     <SomeModule />
 *   </ReadOnlyContext.Provider>
 */
export const ReadOnlyContext = createContext(false);

export function useReadOnly() {
  return useContext(ReadOnlyContext);
}
