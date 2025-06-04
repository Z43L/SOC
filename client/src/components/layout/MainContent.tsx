import { ReactNode } from "react";

interface MainContentProps {
  pageTitle: string;
  children: ReactNode;
  organization: {
    name: string;
  };
}

export function MainContent({ pageTitle, children, organization }: MainContentProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6 justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          {organization.name}
        </div>
      </div>
      <main className="grid gap-4 p-4 md:gap-8 md:p-6">
        {children}
      </main>
    </div>
  );
}