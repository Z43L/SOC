/**
 * Test básico para el sistema de construcción de agentes
 */

import { AgentOS } from '../agent-builder.js';
import { BuildQueue } from '../build-queue.js';
import { ArtifactManager } from '../artifact-manager.js';

async function testAgentConfig() {
    console.log('Testing agent config generation...');
    
    try {
        // Importar AgentBuilder dinámicamente
        const { AgentBuilder } = await import('../agent-builder.js');
        const builder = new AgentBuilder();
        
        const testConfig = {
            os: AgentOS.LINUX,
            serverUrl: 'https://test.example.com',
            organizationKey: 'test-key-123',
            userId: 1,
            customName: 'test-agent',
            architecture: 'x64',
            capabilities: {
                fileSystemMonitoring: true,
                processMonitoring: true,
                networkMonitoring: false
            }
        };
        
        const config = builder.generateAgentConfig(testConfig, 'test-agent-001');
        console.log('✓ Config generation test passed');
        console.log('  - Agent ID:', config.agentId);
        console.log('  - Platform:', config.buildInfo.platform);
        console.log('  - Architecture:', config.architecture || 'universal');
        console.log('  - Build ID:', config.buildInfo.buildId);
        
        return true;
    } catch (error) {
        console.error('✗ Config generation test failed:', error.message);
        return false;
    }
}

async function testBuildQueue() {
    console.log('Testing build queue...');
    
    try {
        const buildQueue = new BuildQueue();
        
        const testConfig = {
            os: AgentOS.WINDOWS,
            serverUrl: 'https://test.example.com',
            organizationKey: 'test-key-456',
            userId: 2,
            customName: 'queue-test-agent',
            architecture: 'x64'
        };
        
        const jobId = buildQueue.addBuildJob(2, testConfig);
        console.log('✓ Job added to queue:', jobId);
        
        const status = buildQueue.getJobStatus(jobId);
        console.log('✓ Job status retrieved:', status.status);
        
        const stats = buildQueue.getQueueStats();
        console.log('✓ Queue stats:', `${stats.totalJobs} jobs, ${stats.activeBuilds} active`);
        
        const cancelResult = buildQueue.cancelJob(jobId, 2);
        console.log('✓ Job cancellation:', cancelResult.success ? 'success' : 'failed');
        
        return true;
    } catch (error) {
        console.error('✗ Build queue test failed:', error.message);
        return false;
    }
}

async function testArtifactManager() {
    console.log('Testing artifact manager...');
    
    try {
        const artifactManager = new ArtifactManager();
        
        // Test stats (no actual file operations)
        const stats = artifactManager.getStats();
        console.log('✓ Artifact stats retrieved:', `${stats.tokens.total} tokens`);
        
        // Test cleanup (should not fail even with no tokens)
        artifactManager.cleanupExpiredTokens();
        console.log('✓ Cleanup executed successfully');
        
        return true;
    } catch (error) {
        console.error('✗ Artifact manager test failed:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('=== Agent Builder Test Suite ===\n');
    
    const results = [];
    
    results.push(await testAgentConfig());
    results.push(await testBuildQueue());
    results.push(await testArtifactManager());
    
    const passed = results.filter(r => r === true).length;
    const total = results.length;
    
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${passed}/${total}`);
    
    if (passed === total) {
        console.log('All tests passed! ✓');
        process.exit(0);
    } else {
        console.log('Some tests failed ✗');
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(console.error);
}

export { testAgentConfig, testBuildQueue, testArtifactManager };