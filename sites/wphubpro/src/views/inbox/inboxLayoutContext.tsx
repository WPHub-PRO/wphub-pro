import { createContext, useContext } from 'react';

export type InboxLayoutContextValue = {
  selectedFolder: string;
  setSelectedFolder: (path: string) => void;
  toggleMailSidebar: () => void;
  closeMailSidebar: () => void;
};

const InboxLayoutContext = createContext<InboxLayoutContextValue | null>(null);

export function useInboxLayout(): InboxLayoutContextValue {
  const v = useContext(InboxLayoutContext);
  if (!v) {
    throw new Error('useInboxLayout must be used within WorkspaceInboxPage');
  }
  return v;
}

export { InboxLayoutContext };
