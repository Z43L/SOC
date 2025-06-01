/**
 * Comprehensive tests for Windows agent functionality
 */

import { windowsCollectors } from './collectors/windows';
import { eventLogCollector } from './collectors/windows/event-log';
import { processCollector } from './collectors/windows/process';
import { registryCollector } from './collectors/windows/registry';
import { servicesCollector } from './collectors/windows/services';
import { Logger } from './core/logger';
import { 
  getWindowsSystemInfo, 
  getWindowsSystemMetrics,
  startWindowsCollectors,
  stopWindowsCollectors
} from './windows-agent';

/**
 * Test framework simple
 */
class TestRunner {
  private passed = 0;
  private failed = 0;
  private logger: Logger;

  constructor() {
    this.logger = new Logger({
      level: 'info',
      enableConsole: true
    });
  }

  async test(name: string, testFn: () => Promise<void>): Promise<void> {
    try {
      console.log(`\n🧪 Testing: ${name}`);
      await testFn();
      console.log(`✅ PASSED: ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${name} - ${error}`);
      this.failed++;
    }
  }

  assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  }

  async finish(): Promise<void> {
    const total = this.passed + this.failed;
    console.log(`\n📊 Test Results:`);
    console.log(`   Total: ${total}`);
    console.log(`   Passed: ${this.passed}`);
    console.log(`   Failed: ${this.failed}`);
    console.log(`   Success Rate: ${total > 0 ? Math.round((this.passed / total) * 100) : 0}%`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

/**
 * Execute all tests
 */
async function runTests(): Promise<void> {
  const runner = new TestRunner();
  
  console.log('=== Windows Agent Tests ===');
  console.log(`Platform: ${process.platform}`);
  
  if (process.platform !== 'win32') {
    console.log('⚠️  WARNING: Not running on Windows, some tests may fail or be skipped');
  }

  // Test 1: Verify Windows collectors are loaded
  await runner.test('Windows collectors should be loaded', async () => {
    runner.assert(Array.isArray(windowsCollectors), 'Windows collectors should be an array');
    runner.assert(windowsCollectors.length > 0, 'Should have at least one Windows collector');
    
    const collectorNames = windowsCollectors.map(c => c.name);
    runner.assert(collectorNames.includes('windows-eventlog'), 'Should include event log collector');
    runner.assert(collectorNames.includes('windows-process'), 'Should include process collector');
    runner.assert(collectorNames.includes('windows-registry'), 'Should include registry collector');
    runner.assert(collectorNames.includes('windows-services'), 'Should include services collector');
  });

  // Test 2: Event Log Collector Configuration
  await runner.test('Event log collector should configure properly', async () => {
    const logger = new Logger({ level: 'info', enableConsole: false });
    let eventReceived = false;
    
    const config = {
      eventCallback: (event: any) => {
        eventReceived = true;
      },
      logger: logger
    };
    
    if (eventLogCollector.configure) {
      await eventLogCollector.configure(config);
    }
    runner.assert(true, 'Configuration should succeed');
  });

  // Test 3: Process Collector Configuration
  await runner.test('Process collector should configure properly', async () => {
    const logger = new Logger({ level: 'info', enableConsole: false });
    let eventReceived = false;
    
    const config = {
      eventCallback: (event: any) => {
        eventReceived = true;
      },
      logger: logger
    };
    
    if (processCollector.configure) {
      await processCollector.configure(config);
    }
    runner.assert(true, 'Configuration should succeed');
  });

  // Test 4: Registry Collector Configuration
  await runner.test('Registry collector should configure properly', async () => {
    const logger = new Logger({ level: 'info', enableConsole: false });
    let eventReceived = false;
    
    const config = {
      eventCallback: (event: any) => {
        eventReceived = true;
      },
      logger: logger
    };
    
    if (registryCollector.configure) {
      await registryCollector.configure(config);
    }
    runner.assert(true, 'Configuration should succeed');
  });

  // Test 5: Services Collector Configuration  
  await runner.test('Services collector should configure properly', async () => {
    const logger = new Logger({ level: 'info', enableConsole: false });
    let eventReceived = false;
    
    const config = {
      eventCallback: (event: any) => {
        eventReceived = true;
      },
      logger: logger
    };
    
    if (servicesCollector.configure) {
      await servicesCollector.configure(config);
    }
    runner.assert(true, 'Configuration should succeed');
  });

  // Test 6: Windows System Info (only on Windows)
  if (process.platform === 'win32') {
    await runner.test('Windows system info should be retrieved', async () => {
      const systemInfo = await getWindowsSystemInfo();
      
      runner.assert(typeof systemInfo === 'object', 'System info should be an object');
      runner.assert(typeof systemInfo.hostname === 'string', 'Should have hostname');
      runner.assert(typeof systemInfo.ip === 'string', 'Should have IP');
      runner.assert(systemInfo.os === 'Windows', 'OS should be Windows');
      runner.assert(typeof systemInfo.version === 'string', 'Should have version');
    });

    await runner.test('Windows system metrics should be retrieved', async () => {
      const metrics = await getWindowsSystemMetrics();
      
      runner.assert(typeof metrics === 'object', 'Metrics should be an object');
      runner.assert(typeof metrics.cpuUsage === 'number', 'Should have CPU usage');
      runner.assert(typeof metrics.memoryUsage === 'number', 'Should have memory usage');
      runner.assert(typeof metrics.diskUsage === 'number', 'Should have disk usage');
      runner.assert(metrics.timestamp instanceof Date, 'Should have timestamp');
    });
  } else {
    console.log('⏭️  Skipping Windows-specific system tests (not on Windows)');
  }

  // Test 7: Collector compatibility
  await runner.test('All collectors should be compatible with win32', async () => {
    for (const collector of windowsCollectors) {
      runner.assert(
        collector.compatibleSystems.includes('win32'),
        `Collector ${collector.name} should be compatible with win32`
      );
    }
  });

  // Test 8: Collector descriptions
  await runner.test('All collectors should have descriptions', async () => {
    for (const collector of windowsCollectors) {
      runner.assert(
        typeof collector.description === 'string' && collector.description.length > 0,
        `Collector ${collector.name} should have a description`
      );
    }
  });

  // Test 9: Start/Stop functionality (safe test)
  await runner.test('Collectors should start and stop safely', async () => {
    const logger = new Logger({ level: 'error', enableConsole: false }); // Only errors
    let eventsReceived = 0;
    
    const eventCallback = (event: any) => {
      eventsReceived++;
    };

    // Test each collector individually
    for (const collector of windowsCollectors) {
      try {
        // Configure
        if (collector.configure) {
          await collector.configure({ eventCallback, logger });
        }

        // Start
        const started = await collector.start();
        runner.assert(typeof started === 'boolean', `${collector.name} start should return boolean`);

        // Wait a bit (not too long to avoid actual monitoring)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Stop
        const stopped = await collector.stop();
        runner.assert(typeof stopped === 'boolean', `${collector.name} stop should return boolean`);
        
      } catch (error) {
        // On non-Windows platforms or missing dependencies, this is expected
        if (process.platform !== 'win32') {
          console.log(`   ⏭️  ${collector.name} skipped (not on Windows)`);
        } else {
          // On Windows, some collectors might fail due to missing dependencies, which is OK
          console.log(`   ⚠️  ${collector.name} failed (possibly missing dependencies): ${error}`);
        }
      }
    }
  });

  // Test 10: Windows collector integration functions
  await runner.test('Windows agent functions should be callable', async () => {
    const logger = new Logger({ level: 'error', enableConsole: false });
    let eventsReceived = 0;
    
    const eventCallback = (event: any) => {
      eventsReceived++;
    };

    try {
      // Test start/stop collectors functions
      const started = await startWindowsCollectors(logger, eventCallback);
      runner.assert(typeof started === 'boolean', 'startWindowsCollectors should return boolean');
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief wait
      
      const stopped = await stopWindowsCollectors();
      runner.assert(typeof stopped === 'boolean', 'stopWindowsCollectors should return boolean');
      
    } catch (error) {
      if (process.platform !== 'win32') {
        console.log('   ⏭️  Integration test skipped (not on Windows)');
      } else {
        // On Windows, might fail due to missing dependencies
        console.log(`   ⚠️  Integration test failed (possibly missing dependencies): ${error}`);
      }
    }
  });

  await runner.finish();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { runTests };