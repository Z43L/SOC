import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';

interface TenantContextType {
  organizationId: number | null;
  organizationName: string;
  userRole: string;
  language: string;
  setLanguage: (lang: string) => void;
}

const defaultContext: TenantContextType = {
  organizationId: null,
  organizationName: 'Organization',
  userRole: '',
  language: 'en',
  setLanguage: () => {},
};

const TenantContext = createContext<TenantContextType>(defaultContext);

export const useTenant = () => useContext(TenantContext);

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [language, setLanguage] = useState<string>(
    localStorage.getItem('preferred-language') || navigator.language.split('-')[0] || 'en'
  );
  
  const organizationId = user?.organizationId || null;
  const organizationName = user?.organizationId 
    ? `Organization ${user.organizationId}` 
    : 'Organization';
  const userRole = user?.role || '';
  
  useEffect(() => {
    if (language) {
      localStorage.setItem('preferred-language', language);
    }
  }, [language]);
  
  return (
    <TenantContext.Provider
      value={{
        organizationId,
        organizationName,
        userRole,
        language,
        setLanguage,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};