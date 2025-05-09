import { FC } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import PlaybookManager from "@/components/soar/PlaybookManager";

interface SoarProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  organization: {
    name: string;
  };
}

const Soar: FC<SoarProps> = ({ user, organization }) => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} activeSection="soar" />
      
      <MainContent pageTitle="SOAR - Security Orchestration, Automation & Response" organization={organization}>
        <PlaybookManager />
      </MainContent>
    </div>
  );
};

export default Soar;