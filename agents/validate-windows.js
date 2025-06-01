/**
 * Simple validation test for Windows agent 
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('=== Windows Agent Validation ===');
console.log(`Platform: ${process.platform}`);
console.log(`Node version: ${process.version}`);

try {
  // Test 1: Check if we can import the collectors module
  console.log('\n1. Testing collectors import...');
  const { windowsCollectors } = require('./dist/collectors/windows/index.js');
  console.log(`✅ Found ${windowsCollectors.length} Windows collectors`);
  
  windowsCollectors.forEach((collector, index) => {
    console.log(`   ${index + 1}. ${collector.name} - ${collector.description}`);
  });
  
  // Test 2: Test individual collector imports
  console.log('\n2. Testing individual collector imports...');
  const { eventLogCollector } = require('./dist/collectors/windows/event-log.js');
  const { processCollector } = require('./dist/collectors/windows/process.js');
  const { registryCollector } = require('./dist/collectors/windows/registry.js');
  const { servicesCollector } = require('./dist/collectors/windows/services.js');
  
  console.log('✅ All individual collectors imported successfully');
  
  // Test 3: Test Windows agent functions
  console.log('\n3. Testing Windows agent functions...');
  const windowsAgent = require('./dist/windows-agent.js');
  
  console.log('✅ Windows agent functions imported successfully');
  console.log(`   Available functions: ${Object.keys(windowsAgent).join(', ')}`);
  
  // Test 4: Basic collector structure validation
  console.log('\n4. Validating collector structure...');
  
  for (const collector of windowsCollectors) {
    if (!collector.name || typeof collector.name !== 'string') {
      throw new Error(`Collector missing valid name: ${collector}`);
    }
    
    if (!collector.description || typeof collector.description !== 'string') {
      throw new Error(`Collector ${collector.name} missing valid description`);
    }
    
    if (!Array.isArray(collector.compatibleSystems) || !collector.compatibleSystems.includes('win32')) {
      throw new Error(`Collector ${collector.name} not compatible with win32`);
    }
    
    if (typeof collector.start !== 'function') {
      throw new Error(`Collector ${collector.name} missing start function`);
    }
    
    if (typeof collector.stop !== 'function') {
      throw new Error(`Collector ${collector.name} missing stop function`);
    }
  }
  
  console.log('✅ All collectors have valid structure');
  
  // Test 5: Safe configuration test
  console.log('\n5. Testing collector configuration...');
  
  let configuredCount = 0;
  for (const collector of windowsCollectors) {
    try {
      if (collector.configure && typeof collector.configure === 'function') {
        configuredCount++;
      }
    } catch (error) {
      console.log(`   ⚠️ Collector ${collector.name} configuration test failed: ${error.message}`);
    }
  }
  
  console.log(`✅ Found ${configuredCount} configurable collectors`);
  
  console.log('\n🎉 All validation tests passed!');
  console.log('\n📝 Summary:');
  console.log(`   - ${windowsCollectors.length} Windows collectors available`);
  console.log(`   - ${configuredCount} collectors support configuration`);
  console.log('   - All collectors have proper structure and compatibility');
  console.log('   - Windows agent functions are importable');
  
  if (process.platform !== 'win32') {
    console.log('\n⚠️  Note: Running on non-Windows platform. Actual functionality may be limited.');
  }

} catch (error) {
  console.error('\n❌ Validation failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}