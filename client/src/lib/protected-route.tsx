import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Route, Redirect } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: (params?: any) => React.JSX.Element;
}) {
  const { user, organization, isLoading } = useAuth();

  return (
    <Route path={path}>
      {(params) => (
        isLoading ? (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : user ? (
          <Component {...params} user={user} organization={organization} />
        ) : (
          <Redirect to="/auth" />
        )
      )}
    </Route>
  );
}