// Simple test script to validate playbook testing functionality
const fetch = require('node-fetch');

async function testPlaybookTesting() {
  console.log('🔧 Testing Playbook Testing API...');
  
  try {
    // Test the playbook testing endpoint
    const response = await fetch('http://localhost:3000/api/playbooks/1/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In real scenario, you'd need proper authentication
      },
      body: JSON.stringify({
        testData: {
          alertId: 'test-alert-123',
          severity: 'high',
          source: 'test',
          timestamp: Date.now()
        },
        dryRun: true
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Playbook testing API is working!');
      console.log('📊 Test Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ API Error:', response.status, response.statusText);
      const error = await response.text();
      console.log('Error details:', error);
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
    console.log('🔄 Make sure the server is running on port 3000');
  }
}

// Check if server is accessible first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      console.log('✅ Server is running');
      await testPlaybookTesting();
    } else {
      console.log('⚠️ Server responded but not healthy');
    }
  } catch (error) {
    console.log('❌ Server not accessible:', error.message);
    console.log('🔄 Please start the server first with: npm run dev');
  }
}

checkServer();
