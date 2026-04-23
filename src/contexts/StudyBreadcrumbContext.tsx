import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  /** When set, breadcrumbs replace the raw `studies/:uuid` tail with this label. */
  activeStudyLabel: string | null;
  setActiveStudyLabel: (label: string | null) => void;
};

const StudyBreadcrumbContext = createContext<Ctx | null>(null);

export function StudyBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [activeStudyLabel, setActiveStudyLabelState] = useState<string | null>(null);

  const setActiveStudyLabel = useCallback((label: string | null) => {
    setActiveStudyLabelState(label);
  }, []);

  const value = useMemo(
    () => ({ activeStudyLabel, setActiveStudyLabel }),
    [activeStudyLabel, setActiveStudyLabel],
  );

  return (
    <StudyBreadcrumbContext.Provider value={value}>
      {children}
    </StudyBreadcrumbContext.Provider>
  );
}

export function useStudyBreadcrumb() {
  const v = useContext(StudyBreadcrumbContext);
  if (!v) {
    return { activeStudyLabel: null as string | null, setActiveStudyLabel: (_: string | null) => {} };
  }
  return v;
}
