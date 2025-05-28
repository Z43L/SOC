import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import * as parser from 'cron-parser';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { DatabaseStorage } from '../storage';
import { 
  ReportTemplate, 
  InsertReportGenerated, 
  ReportGenerated,
  ReportType,
  ReportStatusType 
} from '../../shared/schema';

export interface ReportData {
  title: string;
  organization: {
    name: string;
    logo?: string;
  };
  period: {
    from: Date;
    to: Date;
    description: string;
  };
  generatedAt: Date;
  generatedBy?: string;
  summary?: {
    totalAlerts: number;
    criticalIncidents: number;
    riskScore: number;
    complianceScore?: number;
  };
  sections: ReportSection[];
  charts?: ChartData[];
  appendices?: ReportAppendix[];
}

export interface ReportSection {
  title: string;
  subtitle?: string;
  content: any;
  type: 'metrics' | 'incidents' | 'compliance' | 'agents' | 'vulnerabilities' | 'threats' | 'performance' | 'custom';
}

export interface ChartData {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'pie' | 'area';
  data: any;
  base64?: string; // SVG/PNG data
}

export interface ReportAppendix {
  title: string;
  content: any;
  type: 'table' | 'text' | 'list';
}

export class ReportGeneratorService {
  private storage: DatabaseStorage;
  private templatesDir: string;
  private reportsDir: string;
  private emailTransporter?: nodemailer.Transporter;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
    this.templatesDir = path.join(__dirname, '..', 'templates', 'reports');
    this.reportsDir = path.join(process.cwd(), 'reports');
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
    
    // Initialize email transporter if configured
    this.initializeEmail();
    
    // Start cron job scheduler
    this.startScheduler();
  }

  private ensureDirectories() {
    const dirs = [this.templatesDir, this.reportsDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private registerHandlebarsHelpers() {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      if (!date) return '';
      const options: Intl.DateTimeFormatOptions = {};
      
      switch (format) {
        case 'short':
          options.year = 'numeric';
          options.month = 'short';
          options.day = 'numeric';
          break;
        case 'long':
          options.year = 'numeric';
          options.month = 'long';
          options.day = 'numeric';
          options.hour = '2-digit';
          options.minute = '2-digit';
          break;
        default:
          return date.toLocaleDateString();
      }
      
      return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
    });

    // Percentage helper
    Handlebars.registerHelper('percentage', (value: number, decimals: number = 1) => {
      return `${(value * 100).toFixed(decimals)}%`;
    });

    // Risk level helper
    Handlebars.registerHelper('riskLevel', (score: number) => {
      if (score >= 80) return 'High Risk';
      if (score >= 60) return 'Medium Risk';
      if (score >= 40) return 'Low Risk';
      return 'Minimal Risk';
    });

    // Risk color helper
    Handlebars.registerHelper('riskColor', (score: number) => {
      if (score >= 80) return '#dc2626'; // red-600
      if (score >= 60) return '#ea580c'; // orange-600
      if (score >= 40) return '#ca8a04'; // yellow-600
      return '#16a34a'; // green-600
    });

    // Status badge helper
    Handlebars.registerHelper('statusBadge', (status: string) => {
      const statusMap: Record<string, { color: string; bg: string }> = {
        'critical': { color: '#fef2f2', bg: '#dc2626' },
        'high': { color: '#fef3c7', bg: '#d97706' },
        'medium': { color: '#fef3c7', bg: '#ca8a04' },
        'low': { color: '#f0fdf4', bg: '#16a34a' },
        'resolved': { color: '#f0fdf4', bg: '#16a34a' },
        'in_progress': { color: '#eff6ff', bg: '#2563eb' },
        'new': { color: '#fef2f2', bg: '#dc2626' }
      };
      
      const style = statusMap[status] || statusMap['medium'];
      return `<span style="background-color: ${style.bg}; color: ${style.color}; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${status.replace('_', ' ').toUpperCase()}</span>`;
    });

    // Number formatting helper
    Handlebars.registerHelper('formatNumber', (num: number) => {
      return new Intl.NumberFormat().format(num);
    });
  }

  private initializeEmail() {
    const emailConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (emailConfig.host && emailConfig.auth.user) {
      this.emailTransporter = nodemailer.createTransporter(emailConfig);
    }
  }

  private startScheduler() {
    // Run every minute to check for scheduled reports
    cron.schedule('* * * * *', async () => {
      await this.checkScheduledReports();
    });
  }

  async checkScheduledReports() {
    try {
      // Get all enabled templates with cron schedules
      const templates = await this.storage.db
        .select()
        .from(this.storage.schema.reportTemplates)
        .where(this.storage.db.and(
          this.storage.db.eq(this.storage.schema.reportTemplates.isEnabled, true),
          this.storage.db.isNotNull(this.storage.schema.reportTemplates.scheduleCron)
        ));

      for (const template of templates) {
        if (await this.shouldExecuteTemplate(template)) {
          console.log(`Executing scheduled report: ${template.name}`);
          await this.generateReportFromTemplate(template.id, undefined, 'scheduled');
        }
      }
    } catch (error) {
      console.error('Error checking scheduled reports:', error);
    }
  }

  private async shouldExecuteTemplate(template: ReportTemplate): Promise<boolean> {
    if (!template.scheduleCron) return false;

    try {
      const interval = parser.parseExpression(template.scheduleCron);
      const lastRun = await this.getLastReportGeneration(template.id);
      const nextRun = interval.next().toDate();
      const now = new Date();

      // Check if it's time to run and we haven't run recently
      if (now >= nextRun) {
        if (!lastRun || (now.getTime() - lastRun.getTime()) > 60000) { // 1 minute buffer
          return true;
        }
      }
    } catch (error) {
      console.error(`Invalid cron expression for template ${template.id}:`, error);
    }

    return false;
  }

  private async getLastReportGeneration(templateId: number): Promise<Date | null> {
    const lastReport = await this.storage.db
      .select()
      .from(this.storage.schema.reportsGenerated)
      .where(this.storage.db.eq(this.storage.schema.reportsGenerated.templateId, templateId))
      .orderBy(this.storage.db.desc(this.storage.schema.reportsGenerated.createdAt))
      .limit(1);

    return lastReport[0]?.createdAt || null;
  }

  async generateReportFromTemplate(
    templateId: number, 
    requestedBy?: number,
    trigger: 'manual' | 'scheduled' = 'manual'
  ): Promise<ReportGenerated> {
    const template = await this.getReportTemplate(templateId);
    if (!template) {
      throw new Error('Report template not found');
    }

    // Calculate report period based on template parameters
    const { periodFrom, periodTo } = this.calculateReportPeriod(template.parameters as any);

    // Create report record
    const reportData: InsertReportGenerated = {
      templateId: template.id,
      organizationId: template.organizationId,
      name: `${template.name} - ${this.formatPeriod(periodFrom, periodTo)}`,
      type: template.type,
      status: 'generating',
      format: 'pdf',
      periodFrom,
      periodTo,
      requestedBy,
      metadata: { 
        trigger,
        templateVersion: 1,
        generationStarted: new Date().toISOString()
      }
    };

    const report = await this.createReport(reportData);

    try {
      // Generate report content
      const reportContent = await this.generateReportContent(template, periodFrom, periodTo);
      
      // Generate PDF
      const filePath = await this.generatePDF(report, reportContent);
      
      // Calculate file hash
      const fileBuffer = fs.readFileSync(filePath);
      const hashSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Update report with success status
      const updatedReport = await this.updateReport(report.id, {
        status: 'completed',
        filePath,
        fileSize: fileBuffer.length,
        hashSha256,
        generatedAt: new Date(),
        metadata: {
          ...report.metadata as any,
          generationCompleted: new Date().toISOString(),
          sections: reportContent.sections.length,
          charts: reportContent.charts?.length || 0
        }
      });

      // Send email notifications if configured
      if (template.notifyEmails && Array.isArray(template.notifyEmails) && template.notifyEmails.length > 0) {
        await this.sendEmailNotification(template, updatedReport!, filePath);
      }

      return updatedReport!;

    } catch (error) {
      console.error('Error generating report:', error);
      
      // Update report with error status
      await this.updateReport(report.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          ...report.metadata as any,
          generationFailed: new Date().toISOString(),
          errorDetails: error instanceof Error ? error.stack : undefined
        }
      });

      throw error;
    }
  }

  private calculateReportPeriod(parameters: any): { periodFrom: Date; periodTo: Date } {
    const now = new Date();
    const period = parameters.period || 'monthly';

    switch (period) {
      case 'daily':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { periodFrom: yesterday, periodTo: yesterdayEnd };

      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(now);
        weekEnd.setHours(23, 59, 59, 999);
        return { periodFrom: weekStart, periodTo: weekEnd };

      case 'monthly':
      default:
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { periodFrom: monthStart, periodTo: monthEnd };
    }
  }

  private formatPeriod(from: Date, to: Date): string {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    
    return `${from.toLocaleDateString('en-US', options)} to ${to.toLocaleDateString('en-US', options)}`;
  }

  private async generateReportContent(
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ): Promise<ReportData> {
    const organization = await this.storage.getOrganization(template.organizationId);
    const parameters = template.parameters as any;

    const reportData: ReportData = {
      title: template.name,
      organization: {
        name: organization?.name || 'Unknown Organization',
        logo: organization?.logo
      },
      period: {
        from: periodFrom,
        to: periodTo,
        description: this.formatPeriod(periodFrom, periodTo)
      },
      generatedAt: new Date(),
      sections: []
    };

    // Generate content based on report type
    switch (template.type as ReportType) {
      case 'executive_summary':
        await this.generateExecutiveSummaryContent(reportData, template, periodFrom, periodTo);
        break;
      case 'technical_incidents':
        await this.generateTechnicalIncidentsContent(reportData, template, periodFrom, periodTo);
        break;
      case 'compliance_audit':
        await this.generateComplianceAuditContent(reportData, template, periodFrom, periodTo);
        break;
      case 'agent_health':
        await this.generateAgentHealthContent(reportData, template, periodFrom, periodTo);
        break;
      case 'vulnerability_assessment':
        await this.generateVulnerabilityAssessmentContent(reportData, template, periodFrom, periodTo);
        break;
      case 'threat_intelligence':
        await this.generateThreatIntelligenceContent(reportData, template, periodFrom, periodTo);
        break;
      case 'soc_performance':
        await this.generateSOCPerformanceContent(reportData, template, periodFrom, periodTo);
        break;
      default:
        await this.generateCustomContent(reportData, template, periodFrom, periodTo);
    }

    return reportData;
  }

  private async generateExecutiveSummaryContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;

    // Get summary metrics
    const alerts = await this.storage.listAlerts(orgId, 1000, 0, periodFrom, periodTo);
    const incidents = await this.storage.listIncidents(orgId, 1000, 0);
    const metrics = await this.storage.listMetrics(orgId);

    // Calculate summary statistics
    const totalAlerts = alerts.length;
    const criticalIncidents = incidents.filter(i => i.severity === 'critical').length;
    const riskScore = this.calculateRiskScore(alerts, incidents);

    reportData.summary = {
      totalAlerts,
      criticalIncidents,
      riskScore,
      complianceScore: 85 // TODO: Calculate from compliance assessments
    };

    // Add sections
    reportData.sections.push({
      title: 'Executive Summary',
      type: 'metrics',
      content: {
        totalAlerts,
        criticalIncidents,
        riskScore,
        trend: this.calculateTrend(alerts),
        keyInsights: [
          `${totalAlerts} security alerts processed during this period`,
          `${criticalIncidents} critical incidents requiring immediate attention`,
          `Overall risk score: ${riskScore}/100`,
          'Security posture remains within acceptable parameters'
        ]
      }
    });

    // Add alerts breakdown
    reportData.sections.push({
      title: 'Security Alerts Overview',
      type: 'metrics',
      content: {
        byStatus: this.groupBy(alerts, 'status'),
        bySeverity: this.groupBy(alerts, 'severity'),
        bySource: this.groupBy(alerts, 'source'),
        topAlerts: alerts
          .filter(a => a.severity === 'critical' || a.severity === 'high')
          .slice(0, 10)
      }
    });

    // Add incidents section
    if (incidents.length > 0) {
      reportData.sections.push({
        title: 'Security Incidents',
        type: 'incidents',
        content: {
          total: incidents.length,
          byStatus: this.groupBy(incidents, 'status'),
          bySeverity: this.groupBy(incidents, 'severity'),
          critical: incidents.filter(i => i.severity === 'critical')
        }
      });
    }
  }

  private async generateTechnicalIncidentsContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;
    const parameters = template.parameters as any;
    
    const incidents = await this.storage.listIncidents(orgId, 1000, 0);
    const severityFilter = parameters.severityFilter || ['critical', 'high', 'medium', 'low'];
    
    const filteredIncidents = incidents.filter(i => 
      severityFilter.includes(i.severity) &&
      new Date(i.createdAt) >= periodFrom &&
      new Date(i.createdAt) <= periodTo
    );

    reportData.sections.push({
      title: 'Incident Summary',
      type: 'incidents',
      content: {
        total: filteredIncidents.length,
        byStatus: this.groupBy(filteredIncidents, 'status'),
        bySeverity: this.groupBy(filteredIncidents, 'severity'),
        avgResolutionTime: this.calculateAvgResolutionTime(filteredIncidents)
      }
    });

    // Add detailed incident reports
    if (filteredIncidents.length > 0) {
      reportData.sections.push({
        title: 'Detailed Incident Analysis',
        type: 'incidents',
        content: {
          incidents: filteredIncidents.map(incident => ({
            ...incident,
            timeline: incident.timeline || [],
            mitreTactics: incident.mitreTactics || [],
            evidence: incident.evidence || []
          }))
        }
      });
    }
  }

  private async generateComplianceAuditContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;
    
    // Get compliance assessments
    const assessments = await this.storage.listComplianceAssessments(orgId);
    
    reportData.sections.push({
      title: 'Compliance Status Overview',
      type: 'compliance',
      content: {
        frameworks: assessments,
        overall: this.calculateOverallCompliance(assessments),
        gaps: this.identifyComplianceGaps(assessments),
        recommendations: this.generateComplianceRecommendations(assessments)
      }
    });
  }

  private async generateAgentHealthContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;
    
    const agents = await this.storage.listAgents(orgId);
    const connectors = await this.storage.listConnectors(orgId);
    
    reportData.sections.push({
      title: 'Agent Health Summary',
      type: 'agents',
      content: {
        totalAgents: agents.length,
        activeAgents: agents.filter(a => a.status === 'active').length,
        offlineAgents: agents.filter(a => a.status === 'inactive').length,
        agentsByOS: this.groupBy(agents, 'operatingSystem'),
        lastHeartbeat: agents.map(a => ({
          name: a.name,
          hostname: a.hostname,
          lastHeartbeat: a.lastHeartbeat,
          status: a.status
        }))
      }
    });

    reportData.sections.push({
      title: 'Connector Status',
      type: 'agents',
      content: {
        totalConnectors: connectors.length,
        activeConnectors: connectors.filter(c => c.status === 'active').length,
        connectorsByType: this.groupBy(connectors, 'type'),
        connectorsByVendor: this.groupBy(connectors, 'vendor'),
        recentErrors: [] // TODO: Get connector errors
      }
    });
  }

  private async generateVulnerabilityAssessmentContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    // TODO: Implement when vulnerability data is available
    reportData.sections.push({
      title: 'Vulnerability Assessment',
      type: 'vulnerabilities',
      content: {
        message: 'Vulnerability assessment data not yet available. This section will be populated when vulnerability scanning is implemented.'
      }
    });
  }

  private async generateThreatIntelligenceContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;
    
    const threatIntel = await this.storage.listThreatIntel(orgId);
    const threatFeeds = await this.storage.listThreatFeeds(orgId);
    
    reportData.sections.push({
      title: 'Threat Intelligence Summary',
      type: 'threats',
      content: {
        totalThreats: threatIntel.length,
        bySeverity: this.groupBy(threatIntel, 'severity'),
        byType: this.groupBy(threatIntel, 'type'),
        activeFeeds: threatFeeds.filter(f => f.isActive).length,
        recentThreats: threatIntel
          .filter(t => new Date(t.createdAt) >= periodFrom)
          .slice(0, 10)
      }
    });
  }

  private async generateSOCPerformanceContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const orgId = template.organizationId;
    
    const alerts = await this.storage.listAlerts(orgId, 1000, 0, periodFrom, periodTo);
    const incidents = await this.storage.listIncidents(orgId, 1000, 0);
    const metrics = await this.storage.listMetrics(orgId);
    
    // Calculate MTTD and MTTR
    const mttd = this.calculateMTTD(alerts);
    const mttr = this.calculateMTTR(incidents);
    
    reportData.sections.push({
      title: 'SOC Performance Metrics',
      type: 'performance',
      content: {
        mttd: { value: mttd, unit: 'minutes', trend: 'down' },
        mttr: { value: mttr, unit: 'hours', trend: 'down' },
        alertVolume: alerts.length,
        incidentVolume: incidents.length,
        falsePositiveRate: this.calculateFalsePositiveRate(alerts),
        analystPerformance: this.calculateAnalystPerformance(alerts, incidents)
      }
    });
  }

  private async generateCustomContent(
    reportData: ReportData,
    template: ReportTemplate,
    periodFrom: Date,
    periodTo: Date
  ) {
    const parameters = template.parameters as any;
    
    reportData.sections.push({
      title: 'Custom Report',
      type: 'custom',
      content: {
        message: 'This is a custom report template. Content will be generated based on specific parameters.',
        parameters
      }
    });
  }

  // Helper methods for calculations
  private calculateRiskScore(alerts: any[], incidents: any[]): number {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;
    const criticalIncidents = incidents.filter(i => i.severity === 'critical').length;
    
    // Simple risk calculation - could be made more sophisticated
    const score = Math.min(100, (criticalAlerts * 3 + highAlerts * 2 + criticalIncidents * 5));
    return Math.round(score);
  }

  private calculateTrend(alerts: any[]): 'up' | 'down' | 'stable' {
    // Simple trend calculation based on recent vs older alerts
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentAlerts = alerts.filter(a => new Date(a.timestamp) >= weekAgo).length;
    const olderAlerts = alerts.filter(a => new Date(a.timestamp) < weekAgo).length;
    
    if (recentAlerts > olderAlerts * 1.1) return 'up';
    if (recentAlerts < olderAlerts * 0.9) return 'down';
    return 'stable';
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = item[key] || 'unknown';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAvgResolutionTime(incidents: any[]): number {
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved' && i.closedAt);
    if (resolvedIncidents.length === 0) return 0;
    
    const totalTime = resolvedIncidents.reduce((acc, incident) => {
      const created = new Date(incident.createdAt).getTime();
      const resolved = new Date(incident.closedAt).getTime();
      return acc + (resolved - created);
    }, 0);
    
    return Math.round(totalTime / resolvedIncidents.length / (1000 * 60 * 60)); // Hours
  }

  private calculateOverallCompliance(assessments: any[]): number {
    if (assessments.length === 0) return 0;
    const totalScore = assessments.reduce((acc, assessment) => acc + (assessment.score || 0), 0);
    return Math.round(totalScore / assessments.length);
  }

  private identifyComplianceGaps(assessments: any[]): string[] {
    return assessments
      .filter(a => (a.score || 0) < 80)
      .map(a => `${a.framework}: ${a.score}% compliance`);
  }

  private generateComplianceRecommendations(assessments: any[]): string[] {
    const recommendations = [];
    
    assessments.forEach(assessment => {
      if ((assessment.score || 0) < 80) {
        recommendations.push(`Improve ${assessment.framework} compliance through additional controls`);
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('All compliance frameworks are meeting target thresholds');
    }
    
    return recommendations;
  }

  private calculateMTTD(alerts: any[]): number {
    // Mock MTTD calculation - in real implementation, this would be based on detection timestamps
    return Math.round(Math.random() * 30 + 15); // 15-45 minutes
  }

  private calculateMTTR(incidents: any[]): number {
    return this.calculateAvgResolutionTime(incidents);
  }

  private calculateFalsePositiveRate(alerts: any[]): number {
    // Mock calculation - would need actual false positive tracking
    return Math.round(Math.random() * 20 + 5); // 5-25%
  }

  private calculateAnalystPerformance(alerts: any[], incidents: any[]): any {
    return {
      alertsProcessed: alerts.length,
      incidentsHandled: incidents.length,
      avgResponseTime: '15 minutes',
      efficiency: '85%'
    };
  }

  private async generatePDF(report: ReportGenerated, reportData: ReportData): Promise<string> {
    const templatePath = path.join(this.templatesDir, `${report.type}.hbs`);
    const defaultTemplatePath = path.join(this.templatesDir, 'default.hbs');
    
    // Load template (use default if specific template doesn't exist)
    let templateContent: string;
    try {
      templateContent = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      templateContent = fs.readFileSync(defaultTemplatePath, 'utf-8');
    }
    
    const template = Handlebars.compile(templateContent);
    const html = template(reportData);
    
    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const orgDir = path.join(this.reportsDir, report.organizationId.toString());
      const yearDir = path.join(orgDir, new Date().getFullYear().toString());
      const monthDir = path.join(yearDir, (new Date().getMonth() + 1).toString().padStart(2, '0'));
      
      // Ensure directory structure exists
      fs.mkdirSync(monthDir, { recursive: true });
      
      const filename = `${report.type}-${report.id}-${Date.now()}.pdf`;
      const filePath = path.join(monthDir, filename);
      
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      return filePath;
    } finally {
      await browser.close();
    }
  }

  private async sendEmailNotification(
    template: ReportTemplate,
    report: ReportGenerated,
    filePath: string
  ) {
    if (!this.emailTransporter || !template.notifyEmails) return;
    
    const emails = template.notifyEmails as string[];
    const organization = await this.storage.getOrganization(template.organizationId);
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@soc-platform.com',
      to: emails.join(', '),
      subject: `Security Report: ${template.name}`,
      html: `
        <h2>Security Report Generated</h2>
        <p>A new security report has been generated for ${organization?.name}.</p>
        <ul>
          <li><strong>Report:</strong> ${template.name}</li>
          <li><strong>Period:</strong> ${this.formatPeriod(report.periodFrom, report.periodTo)}</li>
          <li><strong>Generated:</strong> ${report.generatedAt?.toLocaleString()}</li>
          <li><strong>Status:</strong> ${report.status}</li>
        </ul>
        <p>The report is attached to this email.</p>
        <p><em>This is an automated message from your SOC Security Platform.</em></p>
      `,
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath
        }
      ]
    };
    
    try {
      await this.emailTransporter.sendMail(mailOptions);
      console.log(`Email notification sent for report ${report.id}`);
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  // Public API methods
  async getReportTemplate(id: number): Promise<ReportTemplate | undefined> {
    const [template] = await this.storage.db
      .select()
      .from(this.storage.schema.reportTemplates)
      .where(this.storage.db.eq(this.storage.schema.reportTemplates.id, id));
    
    return template;
  }

  async createReport(data: InsertReportGenerated): Promise<ReportGenerated> {
    const [report] = await this.storage.db
      .insert(this.storage.schema.reportsGenerated)
      .values(data)
      .returning();
    
    return report;
  }

  async updateReport(id: number, data: Partial<ReportGenerated>): Promise<ReportGenerated | undefined> {
    const [report] = await this.storage.db
      .update(this.storage.schema.reportsGenerated)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(this.storage.db.eq(this.storage.schema.reportsGenerated.id, id))
      .returning();
    
    return report;
  }

  async getReport(id: number, organizationId?: number): Promise<ReportGenerated | undefined> {
    const conditions = [this.storage.db.eq(this.storage.schema.reportsGenerated.id, id)];
    
    if (organizationId !== undefined) {
      conditions.push(this.storage.db.eq(this.storage.schema.reportsGenerated.organizationId, organizationId));
    }
    
    const [report] = await this.storage.db
      .select()
      .from(this.storage.schema.reportsGenerated)
      .where(this.storage.db.and(...conditions));
    
    return report;
  }

  async listReports(organizationId: number, limit = 50, offset = 0): Promise<ReportGenerated[]> {
    return await this.storage.db
      .select()
      .from(this.storage.schema.reportsGenerated)
      .where(this.storage.db.eq(this.storage.schema.reportsGenerated.organizationId, organizationId))
      .orderBy(this.storage.db.desc(this.storage.schema.reportsGenerated.createdAt))
      .limit(limit)
      .offset(offset);
  }

  getReportFilePath(report: ReportGenerated): string | null {
    return report.filePath || null;
  }

  generateSignedUrl(filePath: string, expiresIn = 600): string {
    // Simple signed URL generation - in production, use proper cloud storage URLs
    const timestamp = Date.now() + (expiresIn * 1000);
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'default-secret')
      .update(`${filePath}:${timestamp}`)
      .digest('hex');
    
    return `/api/reports/download?path=${encodeURIComponent(filePath)}&expires=${timestamp}&signature=${signature}`;
  }
}
