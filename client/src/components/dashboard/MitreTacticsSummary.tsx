import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Info } from "lucide-react";

interface MitreTactic {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

interface MitreTacticsSummaryProps {
  tactics: MitreTactic[];
  isLoading: boolean;
}

const MitreTacticsSummary: FC<MitreTacticsSummaryProps> = ({ tactics, isLoading }) => {
  // Usamos los datos recibidos, o un array vacío si no hay datos
  const displayTactics = tactics && tactics.length > 0 ? tactics : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-medium">Top MITRE ATT&CK Tactics</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 w-full bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-11/12 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-4/5 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-1/2 bg-muted animate-pulse rounded"></div>
          </div>
        ) : displayTactics.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">
            <p>No hay datos disponibles</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayTactics.map(tactic => (
              <div key={tactic.id} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm">{tactic.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {tactic.count} alerts ({tactic.percentage}%)
                  </span>
                </div>
                <Progress value={tactic.percentage} className="h-1.5" />
              </div>
            ))}
            
            <div className="pt-2 pb-1">
              <div className="text-xs text-muted-foreground flex items-center">
                <Info className="h-3 w-3 mr-1" />
                <span>Based on observed ATT&CK tactics in recent alerts</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MitreTacticsSummary;