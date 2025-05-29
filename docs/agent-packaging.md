# SOC Agent Packaging and Deployment

## Overview

The SOC Intelligent Agent packaging system creates self-contained binary executables for Linux, Windows, and macOS platforms using TypeScript/Node.js and the `pkg` tool. This ensures easy deployment without requiring Node.js installation on target systems.

## Key Features

### 1. Path Normalization
- Agent resolves paths relative to executable location using `process.execPath`
- Configuration files searched in executable directory first, then system locations
- Logs and temporary files created relative to agent binary

### 2. Self-Contained Binaries
- No Node.js runtime dependency on target systems
- All dependencies bundled into single executable
- Cross-platform compatibility (Linux x64/ARM64, Windows x64, macOS x64/ARM64)

### 3. Enhanced Telemetry
- Binary integrity verification via SHA256 checksums
- Platform detection and system information reporting
- Installation method tracking
- Comprehensive heartbeat data

### 4. Auto-Update Support
- Signature verification for downloaded updates
- Checksum validation
- Atomic binary replacement
- Rollback capability

## Build Process

### Prerequisites
```bash
cd agents
npm install
```

### Manual Build
```bash
# Build TypeScript
npm run build

# Package for all platforms
npm run package:all

# Or individual platforms
npm run package:linux    # Linux x64 + ARM64
npm run package:windows  # Windows x64
npm run package:macos    # macOS x64 + ARM64
```

### GitHub Actions
The repository includes automated builds via `.github/workflows/build-agents.yml`:

- **Linux**: Ubuntu runner, creates x64 and ARM64 binaries
- **Windows**: Windows runner, creates x64 binary  
- **macOS**: macOS runner, creates universal binaries
- **Releases**: Automatic release creation on git tags

## Installation Methods

### Linux

#### Manual Installation
```bash
# Download and install binary
sudo mkdir -p /opt/soc-agent
sudo cp soc-agent-linux-x64 /opt/soc-agent/soc-agent
sudo chmod +x /opt/soc-agent/soc-agent

# Install systemd service
sudo cp scripts/soc-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now soc-agent
```

#### Package Installation (Future)
```bash
# Debian/Ubuntu
sudo dpkg -i soc-agent_1.0.0_amd64.deb

# RHEL/CentOS/Fedora  
sudo rpm -i soc-agent-1.0.0.x86_64.rpm
```

#### Bootstrap Script
```bash
curl -s https://downloads.soccloud.com/install.sh | sudo bash -s -- --org "your-org-key"
```

### Windows

#### Manual Installation
```powershell
# Copy binary to Program Files
Copy-Item soc-agent-windows.exe "C:\Program Files\SOC-Agent\soc-agent.exe"

# Install as Windows service (requires admin)
sc create SOCAgent binPath="C:\Program Files\SOC-Agent\soc-agent.exe" start=auto
sc start SOCAgent
```

#### MSI Package (Future)
```powershell
msiexec /i soc-agent-1.0.0-windows.msi /quiet
```

### macOS

#### Manual Installation
```bash
# Copy binary
sudo mkdir -p /opt/soc-agent
sudo cp soc-agent-macos-x64 /opt/soc-agent/soc-agent
sudo chmod +x /opt/soc-agent/soc-agent

# Install launchd service
sudo cp scripts/com.soc.agent.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.soc.agent.plist
```

#### PKG Installer (Future)
```bash
sudo installer -pkg soc-agent-1.0.0-macos.pkg -target /
```

## Configuration

### Default Locations
The agent searches for configuration in the following order:

1. `$AGENT_CONFIG_PATH` environment variable
2. `agent.yaml` in same directory as executable
3. Platform-specific system location:
   - Linux/macOS: `/etc/soc-agent/agent.yaml`
   - Windows: `%ProgramData%\SOC-Agent\agent.yaml`

### Sample Configuration
```yaml
# SOC Agent Configuration
serverUrl: "https://your-soc-server.com"
organizationKey: "your-organization-key"

# Agent identification (auto-populated)
agentId: ""

# Intervals (seconds)
heartbeatInterval: 60
dataUploadInterval: 300
scanInterval: 3600

# Endpoints
registrationEndpoint: "/api/agents/register"
dataEndpoint: "/api/agents/data"
heartbeatEndpoint: "/api/agents/heartbeat"

# Security
signMessages: false
enableSignatureVerification: true

# Capabilities
capabilities:
  fileSystemMonitoring: true
  processMonitoring: true
  networkMonitoring: true
  securityLogsMonitoring: true
  malwareScanning: false
  vulnerabilityScanning: false

# Logging (relative to executable)
logFilePath: "agent.log"
logLevel: "info"
maxStorageSize: 100

# Transport
transport: "https"
compressionEnabled: true

# Commands
enableCommands: true
allowedCommands:
  - "script"
  - "configUpdate"
  - "isolate"
  - "upgrade"
```

## Service Management

### Linux (systemd)
```bash
# Status
sudo systemctl status soc-agent

# Start/Stop/Restart
sudo systemctl start soc-agent
sudo systemctl stop soc-agent
sudo systemctl restart soc-agent

# Logs
sudo journalctl -u soc-agent -f
```

### Windows
```powershell
# Status
sc query SOCAgent

# Start/Stop
sc start SOCAgent
sc stop SOCAgent

# Logs
Get-EventLog -LogName Application -Source "SOCAgent"
```

### macOS (launchd)
```bash
# Status
sudo launchctl list | grep com.soc.agent

# Start/Stop
sudo launchctl kickstart system/com.soc.agent
sudo launchctl kill TERM system/com.soc.agent

# Logs
tail -f /var/log/soc-agent.log
```

## Update Process

### Automatic Updates
The agent includes built-in update capability:

1. Periodically checks for new versions
2. Downloads and verifies signatures
3. Performs atomic binary replacement
4. Restarts service automatically

### Manual Updates
```bash
# Linux
sudo systemctl stop soc-agent
sudo cp new-agent-binary /opt/soc-agent/soc-agent
sudo systemctl start soc-agent

# Windows
sc stop SOCAgent
copy new-agent.exe "C:\Program Files\SOC-Agent\soc-agent.exe"
sc start SOCAgent

# macOS
sudo launchctl unload /Library/LaunchDaemons/com.soc.agent.plist
sudo cp new-agent-binary /opt/soc-agent/soc-agent
sudo launchctl load /Library/LaunchDaemons/com.soc.agent.plist
```

## Security Features

### Code Signing
- All binaries signed with EV certificates
- Signature verification before updates
- Trusted certificate validation

### Binary Integrity
- SHA256 checksums calculated and reported
- Server-side hash verification
- Tamper detection

### Network Security
- TLS/HTTPS for all communications
- Certificate pinning (optional)
- Compressed and encrypted data transfer

## Troubleshooting

### Common Issues

**Agent won't start**
- Check configuration file syntax
- Verify file permissions
- Review system logs

**Configuration not found**
- Check file paths and permissions
- Verify AGENT_CONFIG_PATH environment variable
- Ensure configuration in expected locations

**Update failures**
- Verify network connectivity
- Check signature verification settings
- Review update server availability

### Debug Mode
```bash
# Enable debug logging
export SOC_AGENT_DEBUG=1
./soc-agent

# Or via configuration
logLevel: "debug"
```

### Log Locations
- Linux: `/var/log/soc-agent.log` or relative to binary
- Windows: Event Log or relative to binary
- macOS: `/var/log/soc-agent.log` or relative to binary

## Development

### Building from Source
```bash
# Clone repository
git clone https://github.com/Z43L/SOC.git
cd SOC/agents

# Install dependencies
npm install

# Build and package
npm run build
npm run package:all
```

### Testing
```bash
# Run enhanced demo
./dist/agents/soc-agent-enhanced

# Check telemetry output
# Verify path resolution
# Test configuration loading
```

### Adding Features
1. Modify TypeScript source in `agents/`
2. Update configuration schema if needed
3. Test on all target platforms
4. Update documentation

## Roadmap

### Sprint 1-2 ✅
- ✅ Path normalization for packaging
- ✅ pkg integration
- ✅ Basic telemetry enhancement
- ✅ GitHub Actions setup

### Sprint 3-4
- [ ] Platform-specific packages (deb/rpm/msi/pkg)
- [ ] Code signing implementation
- [ ] Enhanced update mechanism

### Sprint 5-6
- [ ] Download page and UI integration
- [ ] Advanced security features
- [ ] Smoke testing framework

### Sprint 7-8
- [ ] Production deployment
- [ ] Documentation finalization
- [ ] Performance optimization