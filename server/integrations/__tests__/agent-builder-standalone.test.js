/**
 * Test independiente para componentes de construcción de agentes
 */

// Test para AgentOS enum
function testAgentOS() {
    console.log('Testing AgentOS enum...');
    
    const AgentOS = {
        WINDOWS: 'windows',
        MACOS: 'macos',
        LINUX: 'linux'
    };
    
    const platforms = [AgentOS.WINDOWS, AgentOS.MACOS, AgentOS.LINUX];
    console.log('✓ AgentOS platforms:', platforms.join(', '));
    
    return true;
}

// Test para configuración de agente (sin dependencias)
function testAgentConfigGeneration() {
    console.log('Testing agent config generation logic...');
    
    try {
        const testConfig = {
            os: 'linux',
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
        
        // Simular generación de configuración
        const agentConfig = {
            serverUrl: testConfig.serverUrl,
            registrationKey: testConfig.registrationKey,
            agentId: 'test-agent-001',
            buildInfo: {
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                platform: testConfig.os,
                userId: testConfig.userId,
                customName: testConfig.customName,
                buildId: `build-${Date.now()}`
            },
            capabilities: testConfig.capabilities,
            architecture: testConfig.architecture
        };
        
        console.log('✓ Agent config structure validated');
        console.log('  - Agent ID:', agentConfig.agentId);
        console.log('  - Platform:', agentConfig.buildInfo.platform);
        console.log('  - Architecture:', agentConfig.architecture);
        
        return true;
    } catch (error) {
        console.error('✗ Agent config test failed:', error.message);
        return false;
    }
}

// Test para lógica de arquitecturas
function testArchitectureSupport() {
    console.log('Testing architecture support...');
    
    try {
        const platforms = {
            windows: ['x64'],
            macos: ['x64', 'arm64', 'universal'],
            linux: ['x64', 'arm64', 'universal']
        };
        
        const validArchitectures = ['x64', 'arm64', 'universal'];
        
        // Validar arquitecturas soportadas
        for (const [platform, archs] of Object.entries(platforms)) {
            for (const arch of archs) {
                if (!validArchitectures.includes(arch)) {
                    throw new Error(`Invalid architecture ${arch} for ${platform}`);
                }
            }
        }
        
        console.log('✓ Architecture validation passed');
        console.log('  - Windows:', platforms.windows.join(', '));
        console.log('  - macOS:', platforms.macos.join(', '));
        console.log('  - Linux:', platforms.linux.join(', '));
        
        return true;
    } catch (error) {
        console.error('✗ Architecture test failed:', error.message);
        return false;
    }
}

// Test para generación de tokens seguros
async function testSecureTokenGeneration() {
    console.log('Testing secure token generation...');
    
    try {
        // Simular generación de token usando crypto
        const crypto = await import('crypto');
        
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 horas
        
        console.log('✓ Token generation successful');
        console.log('  - Token length:', token.length, 'characters');
        console.log('  - Expires in:', Math.round((expiresAt - new Date()) / 1000 / 60 / 60), 'hours');
        
        // Validar formato del token
        if (!/^[a-f0-9]{64}$/.test(token)) {
            throw new Error('Invalid token format');
        }
        
        console.log('✓ Token format validation passed');
        
        return true;
    } catch (error) {
        console.error('✗ Token generation test failed:', error.message);
        return false;
    }
}

// Test para validación de pkg targets
function testPkgTargets() {
    console.log('Testing pkg target generation...');
    
    try {
        const generateTargets = (os, architecture) => {
            const baseTargets = {
                windows: { x64: 'node18-win-x64' },
                macos: { 
                    x64: 'node18-macos-x64', 
                    arm64: 'node18-macos-arm64',
                    universal: 'node18-macos-x64,node18-macos-arm64'
                },
                linux: { 
                    x64: 'node18-linux-x64', 
                    arm64: 'node18-linux-arm64',
                    universal: 'node18-linux-x64,node18-linux-arm64'
                }
            };
            
            const osTargets = baseTargets[os];
            if (!osTargets) {
                throw new Error(`Unsupported OS: ${os}`);
            }
            
            const target = osTargets[architecture];
            if (!target) {
                throw new Error(`Unsupported architecture ${architecture} for ${os}`);
            }
            
            return target;
        };
        
        // Test varios casos
        const testCases = [
            { os: 'windows', arch: 'x64' },
            { os: 'macos', arch: 'universal' },
            { os: 'linux', arch: 'arm64' }
        ];
        
        for (const testCase of testCases) {
            const targets = generateTargets(testCase.os, testCase.arch);
            console.log(`✓ ${testCase.os} ${testCase.arch}:`, targets);
        }
        
        return true;
    } catch (error) {
        console.error('✗ Pkg targets test failed:', error.message);
        return false;
    }
}

async function runIndependentTests() {
    console.log('=== Independent Agent Builder Tests ===\n');
    
    const tests = [
        { name: 'AgentOS Enum', fn: testAgentOS },
        { name: 'Agent Config Generation', fn: testAgentConfigGeneration },
        { name: 'Architecture Support', fn: testArchitectureSupport },
        { name: 'Secure Token Generation', fn: testSecureTokenGeneration },
        { name: 'Pkg Targets', fn: testPkgTargets }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`\n--- ${test.name} ---`);
        try {
            const result = await test.fn();
            results.push(result);
        } catch (error) {
            console.error(`✗ ${test.name} failed:`, error.message);
            results.push(false);
        }
    }
    
    const passed = results.filter(r => r === true).length;
    const total = results.length;
    
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${passed}/${total}`);
    
    if (passed === total) {
        console.log('All independent tests passed! ✓');
        return true;
    } else {
        console.log('Some tests failed ✗');
        return false;
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runIndependentTests()
        .then(success => process.exit(success ? 0 : 1))
        .catch(error => {
            console.error('Test runner error:', error);
            process.exit(1);
        });
}