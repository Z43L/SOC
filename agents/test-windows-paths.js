/**
 * Test script to simulate Windows path issue
 */

// Mock process.execPath to simulate Windows path with spaces
const originalExecPath = process.execPath;
const originalPlatform = process.platform;

// Override process properties
Object.defineProperty(process, 'execPath', {
  value: 'C:\\Program Files\\SOC-Agent\\soc-agent.exe',
  writable: false,
  configurable: true
});

Object.defineProperty(process, 'platform', {
  value: 'win32',
  writable: false,
  configurable: true
});

// Now require the compiled agent to test the path handling
console.log('Testing Windows path handling...');
console.log('Simulated execPath:', process.execPath);
console.log('Simulated platform:', process.platform);

// Import the main function - this would normally be automatic
try {
  require('./dist/main-simple.cjs');
} catch (error) {
  console.error('Error running agent:', error.message);
}

// Restore original values
Object.defineProperty(process, 'execPath', {
  value: originalExecPath,
  writable: false,
  configurable: true
});

Object.defineProperty(process, 'platform', {
  value: originalPlatform,
  writable: false,
  configurable: true
});