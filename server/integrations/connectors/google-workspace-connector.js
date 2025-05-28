/**
 * Google Workspace (Admin SDK Reports) Connector
 * Retrieves admin activity logs from Google Workspace
 */
import { google } from 'googleapis';
import { ApiConnector } from './api-connector-base';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../vite';
/**
 * Google Workspace Admin SDK Reports Connector implementation
 */
export class GoogleWorkspaceConnector extends ApiConnector {
    authClient;
    reportsService;
    constructor(id, organizationId, name, config) {
        super(id, organizationId, name, config);
        this.initializeClient();
    }
    /**
     * Initialize the Google API client
     */
    initializeClient() {
        try {
            const config = this.getConfig();
            // Create JWT client for authentication
            const jwtClient = new google.auth.JWT({
                email: config.credentials.clientEmail,
                key: config.credentials.privateKey,
                scopes: ['https://www.googleapis.com/auth/admin.reports.audit.readonly'],
                subject: config.credentials.delegatedUser
            });
            // Create the reports service
            this.authClient = jwtClient;
            this.reportsService = google.admin({
                version: 'reports_v1',
                auth: this.authClient
            });
        }
        catch (error) {
            log(`Error initializing Google Workspace client: ${error}`, 'google-workspace-connector');
            throw error;
        }
    }
    /**
     * Fetch a batch of activity events from Google Workspace Admin SDK Reports
     */
    async fetchBatch() {
        const config = this.getConfig();
        const events = [];
        const applications = config.applicationNames || ['admin', 'login', 'drive', 'mobile'];
        try {
            // Ensure we have an authenticated client
            if (!this.authClient || !this.reportsService) {
                this.initializeClient();
            }
            // Authentication needs to happen explicitly
            await this.authClient.authorize();
            // For each application, fetch activities
            for (const applicationName of applications) {
                try {
                    // Prepare the request parameters
                    const params = {
                        userKey: config.userKey || 'all',
                        applicationName,
                        maxResults: config.maxResults || 100
                    };
                    // Add page token for pagination if available
                    if (config.state?.pageToken) {
                        params.pageToken = config.state.pageToken;
                    }
                    // Add start time if available
                    if (config.state?.lastEventTimestamp) {
                        params.startTime = config.state.lastEventTimestamp;
                    }
                    // Execute the request
                    const response = await this.reportsService.activities.list(params);
                    const activities = response.data.items || [];
                    // Process activities
                    for (const activity of activities) {
                        // Create a normalized event
                        events.push({
                            id: uuidv4(),
                            timestamp: new Date(activity.id?.time || Date.now()),
                            source: 'google-workspace',
                            type: `google-workspace-${applicationName}`,
                            payload: {
                                actorEmail: activity.actor?.email,
                                ipAddress: activity.ipAddress,
                                eventName: activity.events?.[0]?.name,
                                eventType: activity.events?.[0]?.type,
                                parameters: activity.events?.[0]?.parameters,
                                applicationName,
                                resourceName: activity.events?.[0]?.name
                            },
                            tags: ['google-workspace', applicationName],
                            metadata: {
                                connectorId: this.id,
                                organizationId: this.organizationId
                            }
                        });
                    }
                    // Update connector state for this application
                    // We only update the state if we got results
                    if (activities.length > 0) {
                        let lastEventTimestamp = config.state?.lastEventTimestamp;
                        // Find the most recent activity timestamp
                        for (const activity of activities) {
                            const activityTime = activity.id?.time;
                            if (activityTime && (!lastEventTimestamp || activityTime > lastEventTimestamp)) {
                                lastEventTimestamp = activityTime;
                            }
                        }
                        // Update state
                        await this.updateConfig({
                            state: {
                                pageToken: response.data.nextPageToken,
                                lastEventTimestamp
                            }
                        });
                    }
                }
                catch (appError) {
                    log(`Error fetching ${applicationName} activities: ${appError}`, 'google-workspace-connector');
                    // Continue with other applications
                }
            }
            log(`Retrieved ${events.length} events from Google Workspace Admin SDK Reports`, 'google-workspace-connector');
            return events;
        }
        catch (error) {
            log(`Error fetching events from Google Workspace: ${error}`, 'google-workspace-connector');
            throw error;
        }
    }
    /**
     * Test the connection to Google Workspace Admin SDK Reports
     */
    async testApi() {
        try {
            // Reinitialize the client just to be sure
            this.initializeClient();
            // Try to authenticate
            await this.authClient.authorize();
            // Try to list a single activity to verify access
            await this.reportsService.activities.list({
                userKey: 'all',
                applicationName: 'admin',
                maxResults: 1
            });
        }
        catch (error) {
            log(`Google Workspace connection test failed: ${error}`, 'google-workspace-connector');
            throw error;
        }
    }
}
