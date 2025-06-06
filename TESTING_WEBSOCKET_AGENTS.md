# Testing WebSocket Agent Connectivity

This guide explains how to test the WebSocket connectivity between agents and the SOC server.

## Prerequisites

1. SOC server running on port 5000
2. Agent connector configured with a master registration token
3. Agent binary compiled and configured

## Test Steps

### 1. Server Setup

Make sure the server is running and the agent connector is properly configured:

```bash
# Start the server
npm run dev

# Check the WebSocket endpoints are available
curl -I http://localhost:5000/api/ws/agents
# Should return connection upgrade headers
```

### 2. Agent Registration Test

First, test agent registration via HTTP:

```bash
# Register an agent (replace YOUR_TOKEN with actual master token)
curl -X POST http://localhost:5000/api/agents/register \
  -H "Content-Type: application/json" \
  -H "x-registration-token: YOUR_TOKEN" \
  -d '{
    "hostname": "test-host",
    "os": "linux",
    "arch": "x64",
    "version": "1.0.0"
  }'
```

Expected response:
```json
{
  "success": true,
  "agentId": "generated-uuid",
  "authToken": "jwt-token-here",
  "message": "Agente registrado exitosamente."
}
```

### 3. WebSocket Connection Test

Use the provided test script:

```bash
# Run the WebSocket test (make sure server is running)
node test-websocket-agents.js
```

Expected output:
```
Testing agent WebSocket connection...
✓ WebSocket connection established
✓ Received message: { type: 'welcome', message: 'WebSocket connection established', timestamp: '...' }
Sending heartbeat message...
✓ Received message: { type: 'heartbeat_ack', timestamp: '...', status: 'ok' }
Sending log batch message...
✓ Received message: { type: 'log_batch_ack', processed: 1, timestamp: '...' }
Closing connection...
✓ WebSocket closed: 1000 
Test completed
```

### 4. Agent Real-time Communication Test

Start an agent with WebSocket transport enabled:

```bash
# Copy the example config
cp agent-config-example.yaml /etc/soc-agent/config.yaml

# Edit the config with your server details:
# - serverUrl: your server URL
# - organizationKey: your master registration token
# - transport: "websocket"

# Run the agent
./soc-agent --config /etc/soc-agent/config.yaml
```

Expected agent logs:
```
Agent initialized successfully
Agent registered successfully with ID: agent-uuid
WebSocket connection established
Heartbeat sent via WebSocket
Agent started successfully
```

Expected server logs:
```
[WebSocket] Agent client connected
[WebSocket] Agent authenticated with token: abcd1234...
[WebSocket] Agent message: { type: 'heartbeat', agentId: 'agent-uuid', from: '127.0.0.1', messageId: 1 }
[WebSocket] Heartbeat from agent agent-uuid
[WebSocket] Updated agent agent-uuid heartbeat
```

### 5. Verify Agent Status

Check that the agent status is updated in real-time:

```bash
# Query the agent connector status
curl http://localhost:5000/api/connectors
# Look for agent connector with active agents
```

### 6. Test Log Streaming

Generate some test events from the agent and verify they're processed in real-time via WebSocket.

## Troubleshooting

### Common Issues

1. **WebSocket connection fails**
   - Check server is running on correct port
   - Verify firewall allows WebSocket connections
   - Check agent token is valid

2. **Agent not showing as active**
   - Verify agent registered successfully
   - Check WebSocket heartbeats are being sent
   - Verify server is updating agent status

3. **Logs not streaming**
   - Check agent has events to send
   - Verify WebSocket message size limits
   - Check server processing pipeline

### Debug Mode

Enable debug logging:
- Agent: Set `logLevel: "debug"` in config
- Server: Set `DEBUG_WEBSOCKET=true` environment variable

## Testing Fallback to HTTP

To test the HTTP fallback functionality:

1. Set agent config `transport: "https"` 
2. Start agent - should use HTTP endpoints
3. Change to `transport: "websocket"` 
4. Restart agent - should use WebSocket with HTTP fallback available