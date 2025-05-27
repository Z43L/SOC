# Connector System Documentation

This document provides an overview of the connector system implementation in the SOC platform.

## Overview

The connector system provides a standardized way to ingest data from various sources into the SOC platform. It supports:

- API-based connectors with scheduled polling
- Syslog servers with UDP/TCP/TLS support
- Agent-based data collection

All connectors follow a common interface and are managed by a central registry and scheduler.

## Architecture

The connector system consists of the following components:

1. **Connector Interface**: Defines the standard contract for all connectors
2. **Connector Registry**: Maintains a collection of all active connectors
3. **Connector Scheduler**: Schedules execution of connectors based on their type and configuration
4. **Event Pipeline**: Processes events emitted by connectors through parsing, enrichment, and storage
5. **Specific Connector Implementations**: Specialized implementations for different data sources

## Usage

### Creating a New Connector

```typescript
import { ConnectorFactory } from './connector-factory';
import { SyslogConnectorConfig } from './syslog-connector-enhanced';

// Create a Syslog connector
const syslogConfig: SyslogConnectorConfig = {
  protocol: 'udp',
  port: 514,
  host: '0.0.0.0',
  filtering: {
    facilities: [1, 2, 3],
    severities: [0, 1, 2, 3]
  }
};

const connector = ConnectorFactory.createConnector(
  '123',                  // Connector ID
  '456',                  // Organization ID
  'My Syslog Connector',  // Name
  'syslog',               // Type
  syslogConfig            // Configuration
);

// Start the connector
await connector.start();
```

### Using the Connector Registry

```typescript
import { connectorRegistry } from './connector.interface';

// Get all connectors
const allConnectors = connectorRegistry.getAllConnectors();

// Get connectors for a specific organization
const orgConnectors = connectorRegistry.getOrgConnectors('456');

// Get a specific connector
const connector = connectorRegistry.getConnector('123');

// Unregister a connector
connectorRegistry.unregisterConnector('123');
```

### Using the Scheduler

```typescript
import { connectorScheduler } from './connector-scheduler';

// Run a connector immediately
await connectorScheduler.runConnectorNow('123');

// Update connector schedule
connectorScheduler.updateConnectorSchedule(connector);

// Unschedule a connector
connectorScheduler.unscheduleConnector('123');
```

## Supported Connector Types

### API Connectors

- **AWS CloudWatch Logs**: Collects log events from AWS CloudWatch Logs
- **Google Workspace**: Collects admin activity logs from Google Workspace

### Syslog Connector

Supports:
- UDP protocol
- TCP protocol
- TLS encrypted connections
- Filtering by facility, severity, and content

### Agent Connector

Manages agents installed on client systems:
- Agent registration
- Heartbeat monitoring
- Data collection

## Event Pipeline

The event pipeline processes events from all connectors through:

1. **Parsing**: Converts raw events into a standardized format
2. **Enrichment**: Adds context and intelligence to events
3. **Storage**: Stores events as alerts in the database

## Security

- All connectors include organization ID validation
- Agent authentication uses JWT tokens
- Data segregation is enforced at all levels