import { FC, ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";

interface LayoutProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
  selectedItem?: string;
  pageTitle?: string;
  children: ReactNode;
}

const Layout: FC<LayoutProps> = ({ 
  user, 
  organization, 
  selectedItem = "dashboard", 
  pageTitle, 
  children 
}) => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection={selectedItem} />
      
      <MainContent pageTitle={pageTitle || selectedItem} organization={organization}>
        {children}
      </MainContent>
    </div>
  );
};

export default Layout;