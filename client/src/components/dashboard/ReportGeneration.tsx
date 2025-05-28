import { FC, useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, subDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  FilePdf,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react';

interface ReportGenerationProps {
  recentReports?: {
    id: string;
    name: string;
    type: string;
    format: string;
    createdAt: string;
    url: string;
  }[];
}

const ReportGeneration: FC<ReportGenerationProps> = ({
  recentReports = []
}) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState('security_summary');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [reportName, setReportName] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [selectedSections, setSelectedSections] = useState<string[]>([
    'alerts_summary',
    'incidents_summary',
    'mitre_attacks',
    'compliance'
  ]);

  // Toggle sections to include in report
  const toggleSection = (section: string) => {
    if (selectedSections.includes(section)) {
      setSelectedSections(selectedSections.filter(s => s !== section));
    } else {
      setSelectedSections([...selectedSections, section]);
    }
  };

  // Format date range for display
  const formatDateRange = (range?: DateRange) => {
    if (!range?.from) return 'Select date range';
    if (!range.to) return format(range.from, 'PPP');
    return `${format(range.from, 'PPP')} - ${format(range.to, 'PPP')}`;
  };

  // Handle report generation
  const handleGenerateReport = () => {
    if (!reportType || !reportFormat || !dateRange?.from) {
      toast({
        title: 'Missing information',
        description: 'Please fill out all required fields',
        variant: 'destructive'
      });
      return;
    }

    const reportNameToUse = reportName || 
      `${reportType.replace(/_/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}`;

    setIsGenerating(true);

    // Simulate report generation
    setTimeout(() => {
      setIsGenerating(false);
      toast({
        title: 'Report Generated',
        description: `${reportNameToUse}.${reportFormat} has been generated successfully.`,
      });
    }, 2500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Generation</CardTitle>
        <CardDescription>Generate custom security reports</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recent Reports */}
        {recentReports.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Recent Reports</h4>
            <div className="space-y-2">
              {recentReports.slice(0, 3).map(report => (
                <div 
                  key={report.id}
                  className="flex items-center justify-between rounded-md border border-gray-800 p-2"
                >
                  <div className="flex items-center">
                    {report.format === 'pdf' ? (
                      <FilePdf className="h-4 w-4 mr-2 text-red-500" />
                    ) : report.format === 'csv' ? (
                      <FileSpreadsheet className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2 text-blue-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{report.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(report.createdAt), 'PP')}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      toast({
                        title: 'Downloaded',
                        description: `${report.name} has been downloaded.`,
                      });
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate New Report */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full">Generate New Report</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Generate Security Report</DialogTitle>
              <DialogDescription>
                Configure the report parameters and select data to include.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Report Type</label>
                <Select
                  value={reportType}
                  onValueChange={setReportType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security_summary">Security Summary</SelectItem>
                    <SelectItem value="incident_response">Incident Response</SelectItem>
                    <SelectItem value="compliance_report">Compliance Report</SelectItem>
                    <SelectItem value="threat_intelligence">Threat Intelligence</SelectItem>
                    <SelectItem value="vulnerability_assessment">Vulnerability Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Format</label>
                  <Select
                    value={reportFormat}
                    onValueChange={setReportFormat}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="csv">CSV Spreadsheet</SelectItem>
                      <SelectItem value="json">JSON Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Report Name (Optional)</label>
                  <Input
                    placeholder="Auto-generated if blank"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Tabs defaultValue="calendar" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="calendar">Calendar</TabsTrigger>
                    <TabsTrigger value="preset">Preset Ranges</TabsTrigger>
                  </TabsList>
                  <TabsContent value="calendar" className="mt-2">
                    <div className="flex flex-col">
                      <div className="p-2 border border-gray-800 rounded-md">
                        <Calendar
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={setDateRange}
                          numberOfMonths={1}
                          disabled={{ after: new Date() }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 text-center">
                        {formatDateRange(dateRange)}
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="preset" className="mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        className="justify-start" 
                        onClick={() => setDateRange({
                          from: subDays(new Date(), 7),
                          to: new Date()
                        })}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Last 7 days
                      </Button>
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => setDateRange({
                          from: subDays(new Date(), 30),
                          to: new Date()
                        })}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Last 30 days
                      </Button>
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => setDateRange({
                          from: subDays(new Date(), 90),
                          to: new Date()
                        })}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Last Quarter
                      </Button>
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => setDateRange({
                          from: subDays(new Date(), 365),
                          to: new Date()
                        })}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Last Year
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Include Sections</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="alerts_summary" 
                      checked={selectedSections.includes('alerts_summary')}
                      onCheckedChange={() => toggleSection('alerts_summary')}
                    />
                    <label 
                      htmlFor="alerts_summary" 
                      className="text-sm cursor-pointer"
                    >
                      Alerts Summary
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="incidents_summary" 
                      checked={selectedSections.includes('incidents_summary')}
                      onCheckedChange={() => toggleSection('incidents_summary')}
                    />
                    <label 
                      htmlFor="incidents_summary" 
                      className="text-sm cursor-pointer"
                    >
                      Incidents Summary
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="mitre_attacks" 
                      checked={selectedSections.includes('mitre_attacks')}
                      onCheckedChange={() => toggleSection('mitre_attacks')}
                    />
                    <label 
                      htmlFor="mitre_attacks" 
                      className="text-sm cursor-pointer"
                    >
                      MITRE ATT&CK Map
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="compliance" 
                      checked={selectedSections.includes('compliance')}
                      onCheckedChange={() => toggleSection('compliance')}
                    />
                    <label 
                      htmlFor="compliance" 
                      className="text-sm cursor-pointer"
                    >
                      Compliance Status
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="threat_intel" 
                      checked={selectedSections.includes('threat_intel')}
                      onCheckedChange={() => toggleSection('threat_intel')}
                    />
                    <label 
                      htmlFor="threat_intel" 
                      className="text-sm cursor-pointer"
                    >
                      Threat Intelligence
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="recommendations" 
                      checked={selectedSections.includes('recommendations')}
                      onCheckedChange={() => toggleSection('recommendations')}
                    />
                    <label 
                      htmlFor="recommendations" 
                      className="text-sm cursor-pointer"
                    >
                      Security Recommendations
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={isGenerating || selectedSections.length === 0} 
                onClick={handleGenerateReport}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Report'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <div className="text-xs text-muted-foreground">
          {recentReports.length > 3 && `+${recentReports.length - 3} more reports available`}
        </div>
      </CardFooter>
    </Card>
  );
};

export default ReportGeneration;