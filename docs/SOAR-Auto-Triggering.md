# SOAR Automatic Playbook Triggering

This document explains how to use the automatic playbook triggering feature (SOAR) in the SOC platform.

## Overview

The SOAR (Security Orchestration, Automation, and Response) automatic triggering feature allows playbooks to be automatically executed when specific events occur in the system, such as when new alerts are created.

This implementation uses Redis Streams for event distribution, ensuring reliability and scalability.

## Features

- Automatic execution of playbooks when alerts are created
- Rule-based filtering to determine which playbooks should be triggered
- Support for complex conditions using predicates
- Priority-based execution of playbooks
- Visibility into playbook execution history

## How It Works

1. When an alert is created, an `alert.created` event is published to:
   - The local EventBus for in-memory notification
   - A Redis Stream for reliable, persistent event distribution

2. The PlaybookTriggerEngine:
   - Listens to the Redis Stream for events
   - Processes each event through a BullMQ worker for reliability
   - Evaluates registered playbook bindings against the event
   - Triggers matching playbooks through the SoarExecutor

3. Results of playbook executions are stored in the database for tracking and auditing

## Setting Up Playbook Bindings

Playbook bindings define when playbooks should be automatically triggered. Each binding consists of:

- Event Type: The type of event that triggers the playbook (e.g., `alert.created`)
- Playbook ID: The ID of the playbook to execute
- Predicate: A condition that must be satisfied for the playbook to be triggered
- Organization ID: The organization the binding belongs to
- Priority: Higher priority bindings are evaluated first

### API Endpoints

The following API endpoints are available for managing playbook bindings:

- `GET /api/soar/bindings` - List all bindings for the current organization
- `GET /api/soar/bindings/:id` - Get a specific binding
- `POST /api/soar/bindings` - Create a new binding
- `PUT /api/soar/bindings/:id` - Update an existing binding
- `DELETE /api/soar/bindings/:id` - Delete a binding

### Creating a Binding

To create a new binding, send a POST request to `/api/soar/bindings` with the following payload:

```json
{
  "eventType": "alert.created",
  "predicate": "severity == 'high'",
  "playbookId": 123,
  "description": "Trigger high severity alert playbook",
  "isActive": true,
  "priority": 10
}
```

### Predicate Examples

The `predicate` field supports simple conditions to filter events:

- `severity == 'high'` - Triggers for high severity alerts
- `tags.contains('ransomware')` - Triggers for alerts with the 'ransomware' tag
- `severity == 'critical' && data.sourceIp` - Triggers for critical alerts with a source IP

## Event Structure

The event structure for `alert.created` events includes:

```json
{
  "type": "alert.created",
  "entityId": 123,
  "entityType": "alert",
  "organizationId": 456,
  "timestamp": "2023-01-01T12:00:00Z",
  "data": {
    "alertId": 123,
    "severity": "high",
    "category": "malware",
    "sourceIp": "192.168.1.1",
    "hostId": "host-123",
    "hostname": "workstation-1"
  }
}
```

## Architecture

The implementation uses:

- Redis Streams for reliable event distribution
- BullMQ for reliable job processing
- Predicate evaluation for filtering events
- Integration with the existing SoarExecutor for playbook execution

## Future Enhancements

- Support for more event types beyond `alert.created`
- More advanced predicate evaluation using JSONata or similar
- Integration with GraphQL for real-time updates
- Support for exact-once semantics with Kafka