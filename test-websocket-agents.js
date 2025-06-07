/**
 * Simple test to verify WebSocket agent connectivity works
 */

import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:5000';
const WS_ENDPOINT = '/api/ws/agents';

function testAgentWebSocket() {
  console.log('Testing agent WebSocket connection...');
  
  const wsUrl = `${SERVER_URL}${WS_ENDPOINT}?token=test-agent-token`;
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✓ WebSocket connection established');
    
    // Test heartbeat message
    const heartbeatMessage = {
      type: 'heartbeat',
      agentId: 'test-agent-123',
      timestamp: new Date().toISOString(),
      status: 'active',
      metrics: {
        cpu: 25.5,
        memory: 1024,
        disk: 512
      }
    };
    
    console.log('Sending heartbeat message...');
    ws.send(JSON.stringify(heartbeatMessage));
    
    // Test log batch message
    setTimeout(() => {
      const logBatchMessage = {
        type: 'log_batch',
        agentId: 'test-agent-123',
        timestamp: new Date().toISOString(),
        events: [
          {
            eventType: 'test_event',
            severity: 'low',
            message: 'Test log event from agent',
            timestamp: new Date().toISOString()
          }
        ]
      };
      
      console.log('Sending log batch message...');
      ws.send(JSON.stringify(logBatchMessage));
    }, 1000);
    
    // Close connection after tests
    setTimeout(() => {
      console.log('Closing connection...');
      ws.close();
    }, 3000);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('✓ Received message:', message);
    } catch (error) {
      console.log('✓ Received raw data:', data.toString());
    }
  });
  
  ws.on('error', (error) => {
    console.error('✗ WebSocket error:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`✓ WebSocket closed: ${code} ${reason}`);
    console.log('Test completed');
  });
}

// Run test if server is available
console.log('Starting WebSocket agent test...');
testAgentWebSocket();