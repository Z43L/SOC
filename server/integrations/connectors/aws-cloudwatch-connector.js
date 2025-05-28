/**
 * AWS CloudWatch Logs Connector
 * Retrieves log events from AWS CloudWatch Logs
 */
import { CloudWatchLogsClient, FilterLogEventsCommand, GetLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ApiConnector } from './api-connector-base';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../vite';
/**
 * AWS CloudWatch Logs Connector implementation
 */
export class AwsCloudWatchLogsConnector extends ApiConnector {
    client;
    constructor(id, organizationId, name, config) {
        super(id, organizationId, name, config);
        // Initialize the CloudWatch Logs client
        this.client = new CloudWatchLogsClient({
            region: config.credentials.region,
            credentials: {
                accessKeyId: config.credentials.accessKeyId,
                secretAccessKey: config.credentials.secretAccessKey,
                sessionToken: config.credentials.sessionToken
            }
        });
    }
    /**
     * Fetch a batch of log events from AWS CloudWatch Logs
     */
    async fetchBatch() {
        const config = this.getConfig();
        const events = [];
        try {
            // Prepare the command parameters
            const params = {
                logGroupName: config.logGroupName,
                startTime: config.state?.lastEventTimestamp || config.startTime,
                endTime: config.endTime,
                limit: config.maxResults || 50
            };
            // Add log stream names if specified
            if (config.logStreamNames && config.logStreamNames.length > 0) {
                params.logStreamNames = config.logStreamNames;
            }
            // Add filter pattern if specified
            if (config.filterPattern) {
                params.filterPattern = config.filterPattern;
            }
            // Add next token for pagination if available
            if (config.state?.nextToken) {
                params.nextToken = config.state.nextToken;
            }
            // Execute the command
            let command;
            let logEvents = [];
            let nextToken;
            if (config.filterPattern || (config.logStreamNames && config.logStreamNames.length > 0)) {
                // Use FilterLogEvents if we have a filter pattern or specific log streams
                command = new FilterLogEventsCommand(params);
                const response = await this.client.send(command);
                logEvents = response.events || [];
                nextToken = response.nextToken;
            }
            else {
                // Otherwise use GetLogEvents for a specific log stream
                // First list log streams to get the most recent one
                const logStreams = await this.listLogStreams(config.logGroupName);
                if (logStreams.length === 0) {
                    return [];
                }
                // Get the most recent log stream
                const mostRecentStream = logStreams[0];
                params.logStreamName = mostRecentStream.logStreamName;
                // Get log events from this stream
                command = new GetLogEventsCommand(params);
                const response = await this.client.send(command);
                logEvents = (response.events || []).map(event => ({
                    logStreamName: mostRecentStream.logStreamName,
                    timestamp: event.timestamp,
                    message: event.message,
                    eventId: event.eventId,
                    ingestionTime: event.ingestionTime
                }));
                nextToken = response.nextForwardToken;
            }
            // Process log events
            let lastEventTimestamp = config.state?.lastEventTimestamp || 0;
            for (const logEvent of logEvents) {
                // Update last event timestamp
                if (logEvent.timestamp && logEvent.timestamp > lastEventTimestamp) {
                    lastEventTimestamp = logEvent.timestamp;
                }
                // Create a normalized event
                events.push({
                    id: uuidv4(),
                    timestamp: new Date(logEvent.timestamp || Date.now()),
                    source: 'aws-cloudwatch',
                    type: 'cloudwatch',
                    payload: {
                        message: logEvent.message,
                        logGroupName: config.logGroupName,
                        logStreamName: logEvent.logStreamName,
                        eventId: logEvent.eventId,
                        ingestionTime: logEvent.ingestionTime
                    },
                    tags: ['aws', 'cloudwatch'],
                    metadata: {
                        connectorId: this.id,
                        organizationId: this.organizationId
                    }
                });
            }
            // Update connector state
            await this.updateConfig({
                state: {
                    nextToken,
                    lastEventTimestamp
                }
            });
            log(`Retrieved ${events.length} events from AWS CloudWatch Logs`, 'aws-cloudwatch-connector');
            return events;
        }
        catch (error) {
            log(`Error fetching events from AWS CloudWatch Logs: ${error}`, 'aws-cloudwatch-connector');
            throw error;
        }
    }
    /**
     * Test the connection to AWS CloudWatch Logs
     */
    async testApi() {
        const config = this.getConfig();
        try {
            // Try to list log streams to verify credentials and log group
            await this.listLogStreams(config.logGroupName, 1);
        }
        catch (error) {
            log(`AWS CloudWatch Logs connection test failed: ${error}`, 'aws-cloudwatch-connector');
            throw error;
        }
    }
    /**
     * List log streams for a log group
     */
    async listLogStreams(logGroupName, limit = 10) {
        try {
            const response = await this.client.send({
                logGroupName,
                orderBy: 'LastEventTime',
                descending: true,
                limit
            });
            return response.logStreams || [];
        }
        catch (error) {
            log(`Error listing log streams for ${logGroupName}: ${error}`, 'aws-cloudwatch-connector');
            throw error;
        }
    }
}
