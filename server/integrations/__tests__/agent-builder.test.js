/**
 * Test básico para el sistema de construcción de agentes
 */

import { AgentBuilder, AgentOS } from '../agent-builder.js';
import { buildQueue } from '../build-queue.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function testBasicBuild() {
    console.log('Starting basic build test...');
    
    const builder = new AgentBuilder();
    
    const testConfig = {
        os: AgentOS.LINUX,
        serverUrl: 'https://test.example.com',
        registrationKey: 'test-key-123',
        userId: 1,
        customName: 'test-agent',
        architecture: 'x64',
        capabilities: {
            fileSystemMonitoring: true,
            processMonitoring: true,
            networkMonitoring: false
        }
    };
    
    try {
        console.log('Testing agent config generation...');
        const config = builder.generateAgentConfig(testConfig, 'test-agent-001');
        console.log('Config generated:', JSON.stringify(config, null, 2));
        
        console.log('Config generation test passed ✓');
        return true;
    } catch (error) {
        console.error('Config generation test failed:', error);
        return false;
    }
}

async function testBuildQueue() {
    console.log('Starting build queue test...');
    
    try {
        const testConfig = {
            os: AgentOS.WINDOWS,
            serverUrl: 'https://test.example.com',
            registrationKey: 'test-key-456',
            userId: 2,
            customName: 'queue-test-agent',
            architecture: 'x64'
        };
        
        console.log('Adding job to queue...');
        const jobId = buildQueue.addBuildJob(2, testConfig);
        console.log('Job added with ID:', jobId);
        
        console.log('Getting job status...');
        const status = buildQueue.getJobStatus(jobId);
        console.log('Job status:', status);
        
        console.log('Getting queue stats...');
        const stats = buildQueue.getQueueStats();
        console.log('Queue stats:', stats);
        
        console.log('Cancelling job...');
        const cancelResult = buildQueue.cancelJob(jobId, 2);
        console.log('Cancel result:', cancelResult);
        
        console.log('Build queue test passed ✓');
        return true;
    } catch (error) {
        console.error('Build queue test failed:', error);
        return false;
    }
}

async function runTests() {
    console.log('=== Agent Builder Test Suite ===\n');
    
    const results = [];
    
    results.push(await testBasicBuild());
    results.push(await testBuildQueue());
    
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

export { testBasicBuild, testBuildQueue };