# WebSocket Security Improvements - Testing Guide

This document explains how to test the security improvements made to the WebSocket agent implementation in response to issue #128.

## Overview of Improvements

The WebSocket implementation has been enhanced with the following security and performance improvements:

### 🔐 Security Enhancements
1. **JWT Token Validation**: Proper verification using the existing `verifyAgentToken()` function
2. **AgentId Spoofing Prevention**: Messages with incorrect agentIds are rejected
3. **Authentication Enforcement**: All agent operations tied to verified tokens
4. **Enhanced Logging**: Security events properly logged without exposing sensitive data

### ⚡ Performance Improvements
1. **Asynchronous Event Processing**: Log batches processed in background to avoid blocking
2. **Immediate Acknowledgments**: Faster response times for better agent experience
3. **Better Error Handling**: More specific error codes and messages

## Testing the Improvements

### 1. Security Test Suite

Run the comprehensive security test:
```bash
node test-websocket-security.js
```

This test validates:
- ✅ Connections without tokens are rejected (1008 close code)
- ✅ Connections with invalid tokens are rejected 
- ✅ AgentId spoofing attempts are blocked
- ✅ Proper error messages are returned

### 2. 30-Second Metrics Demo

Run the demo agent that sends metrics every 30 seconds as specified in the issue:
```bash
node demo-agent-30s-metrics.js
```

This demonstrates:
- ❤️ Heartbeat every 30 seconds
- 📊 System metrics collection and transmission
- 📝 Log batch processing
- 🔄 Automatic reconnection
- 🛡️ Proper authentication flow

### 3. Original Agent Test

The existing test still works but now benefits from improved security:
```bash
node test-websocket-agents.js
```

## Server Requirements

To test these improvements, the server must be running with:

1. **WebSocket endpoint active**: `/api/ws/agents`
2. **JWT authentication configured**: Environment variable `JWT_SECRET` set
3. **Agent connector enabled**: Database configured with agent connector

## Expected Behavior

### ✅ Valid Agent Connection
```
[WebSocket] Agent client connected
[WebSocket] Agent authenticated: agent-123 (user: 456)
[WebSocket] Agent message: { type: 'heartbeat', agentId: 'agent-123' }
```

### ❌ Invalid Token
```
[WebSocket] Agent connection without token from 192.168.1.100
[WebSocket] Invalid or expired token from 192.168.1.100
Connection closed: 1008 Invalid or expired token
```

### 🚫 AgentId Spoofing Attempt
```
[WebSocket] AgentId mismatch: fake-agent vs real-agent-123
Error message: "AgentId mismatch with authentication token"
```

## Integration Notes

### For Existing Agents
- Agents with valid JWT tokens continue to work unchanged
- AgentId must match the token or will be automatically corrected
- Error handling is more robust and informative

### For New Implementations
- Use the `demo-agent-30s-metrics.js` as a reference implementation
- Implement proper JWT token handling
- Handle reconnection gracefully
- Process acknowledgments appropriately

## Security Considerations

1. **Token Security**: Never log full tokens (only first 8 characters if needed)
2. **HTTPS/WSS**: Use TLS in production environments
3. **Token Rotation**: Implement regular token refresh in production
4. **Rate Limiting**: Current limits (60 messages/minute) are maintained
5. **Connection Limits**: Maximum 50 connections per IP enforced

## Performance Benefits

1. **Non-blocking Processing**: Event processing doesn't block WebSocket thread
2. **Immediate ACKs**: Faster acknowledgments improve agent responsiveness  
3. **Background Processing**: Heavy operations moved to background
4. **Better Resource Management**: Improved cleanup and error handling

## Monitoring

Key metrics to monitor:
- Connection success/failure rates
- Authentication failures
- AgentId mismatch attempts
- Message processing latency
- Agent heartbeat regularity

## Troubleshooting

### Connection Rejected
- Check JWT token validity and expiration
- Verify agent is properly registered
- Check server logs for specific error

### AgentId Mismatch Errors
- Ensure agent uses agentId from its token
- Don't manually set agentId in messages
- Check token contains correct agentId claim

### Performance Issues
- Monitor event processing queue
- Check for blocked async operations
- Verify WebSocket connection health

---

**Note**: These improvements maintain backward compatibility while significantly enhancing security. All existing valid agents should continue to work without modification.