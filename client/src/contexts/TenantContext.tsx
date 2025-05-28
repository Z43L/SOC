import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'es' | 'fr';

interface TenantContextType {
  organizationId: number | null;
  userRole: string | null;
  language: Language;
  setOrganizationId: (id: number) => void;
  setUserRole: (role: string) => void;
  setLanguage: (language: Language) => void;
}

const TenantContext = createContext<TenantContextType>({
  organizationId: null,
  userRole: null,
  language: 'en',
  setOrganizationId: () => {},
  setUserRole: () => {},
  setLanguage: () => {},
});

export const useTenant = () => useContext(TenantContext);

interface TenantProviderProps {
  children: ReactNode;
  initialOrganizationId?: number;
  initialUserRole?: string;
  initialLanguage?: Language;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({
  children,
  initialOrganizationId = null,
  initialUserRole = null,
  initialLanguage = 'en',
}) => {
  const [organizationId, setOrganizationId] = useState<number | null>(initialOrganizationId);
  const [userRole, setUserRole] = useState<string | null>(initialUserRole);
  const [language, setLanguage] = useState<Language>(initialLanguage);

  return (
    <TenantContext.Provider
      value={{
        organizationId,
        userRole,
        language,
        setOrganizationId,
        setUserRole,
        setLanguage,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};