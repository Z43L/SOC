# SOC Agent Packaging and Deployment

## Overview

The SOC Intelligent Agent packaging system creates **pre-compiled Electron applications** for Linux, Windows, and macOS platforms. Agents are now **compiled on the server** with **embedded configuration** and distributed as platform-specific executables, eliminating the need for client-side compilation or configuration files.

## Key Features

### 1. Electron-Based Architecture
- Native cross-platform applications using Electron
- Embedded configuration in compiled executables
- Simple status monitoring UI (can run headless)
- Background operation as system services

### 2. Server-Side Compilation
- Agents compiled on-demand when generated from frontend
- Configuration embedded during compilation process
- No client-side build requirements
- Pre-compiled executables ready for immediate deployment

### 3. Self-Contained Executables
- No external dependencies required on target systems
- All configuration embedded in the executable
- Cross-platform compatibility:
  - **Linux**: AppImage format (x64, ARM64)
  - **Windows**: Portable .exe format (x64)
  - **macOS**: .dmg installer format (x64, ARM64)

### 4. Enhanced Security
- Configuration cannot be modified post-compilation
- Binary integrity verification
- Platform-specific optimizations
- Secure communication with embedded certificates

## Build Process

### Server-Side Compilation (Automatic) - UPDATED

When an agent is generated from the frontend:

1. **Configuration Generation**: Server generates agent configuration with org key, endpoints, etc.
2. **Electron Project Setup**: Server creates temporary Electron project with embedded config
3. **Platform Compilation**: Server compiles Electron app for target platform using correct build scripts:
   - `build:agent:windows` - Windows x64 portable executable
   - `build:agent:linux` - Linux x64/ARM64 AppImage  
   - `build:agent:macos` - macOS x64/ARM64 DMG installer
4. **Executable Generation**: Generates platform-specific executable with embedded configuration
5. **Download Delivery**: User downloads pre-compiled executable

### Technical Improvements (Issue #138)

The agent compilation system has been updated to:

- ✅ Use the correct Electron build scripts (`build:agent:*` instead of `package:*`)
- ✅ Properly embed configuration files as Electron resources
- ✅ Support cross-platform compilation from Linux Docker containers
- ✅ Include all necessary dependencies for Electron compilation
- ✅ Simplify the build process to use unified scripts

### Cross-Platform Build Requirements

For complete cross-platform compilation, the Docker environment includes:

```dockerfile
# Cross-platform dependencies for Electron builds
RUN apk add --no-cache wine xvfb nss gtk+3.0 alsa-lib
ENV WINEARCH win64
ENV WINEPREFIX /root/.wine
ENV CI true
```

**Note**: Windows cross-compilation from Linux requires wine configuration. For production environments, consider using platform-specific build agents or GitHub Actions with appropriate runners.

### Manual Development Build

```bash
cd agents
npm install

# Build TypeScript sources
npm run build:electron

# Package for specific platforms
npm run package:linux    # Linux x64 + ARM64 (AppImage)
npm run package:windows  # Windows x64 (Portable .exe)
npm run package:macos    # macOS x64 + ARM64 (.dmg)
```

### GitHub Actions
The repository includes automated builds via `.github/workflows/build-agents.yml`:

- **Linux**: Ubuntu runner, creates x64 and ARM64 binaries
- **Windows**: Windows runner, creates x64 binary  
- **macOS**: macOS runner, creates universal binaries
- **Releases**: Automatic release creation on git tags

## Installation Methods

### Automatic Installation (Recommended)

1. **Generate Agent**: Use the web frontend to generate an agent for your organization
2. **Download Executable**: Download the pre-compiled executable for your platform
3. **Run Agent**: Execute the downloaded file - configuration is embedded

### Platform-Specific Installation

#### Linux (AppImage)

```bash
# Download from web interface (e.g., soc-agent-linux-x86_64.AppImage)
chmod +x soc-agent-linux-x86_64.AppImage

# Run directly (for testing)
./soc-agent-linux-x86_64.AppImage

# Install as systemd service
sudo mkdir -p /opt/soc-agent
sudo cp soc-agent-linux-x86_64.AppImage /opt/soc-agent/soc-agent
sudo chmod +x /opt/soc-agent/soc-agent

# Create systemd service file
sudo tee /etc/systemd/system/soc-agent.service > /dev/null <<EOF
[Unit]
Description=SOC Intelligent Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/opt/soc-agent/soc-agent
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable --now soc-agent
```

#### Windows (Portable .exe)

```powershell
# Download from web interface (e.g., soc-agent-windows-x64.exe)
# Copy to desired location
Copy-Item soc-agent-windows-x64.exe "C:\Program Files\SOC-Agent\soc-agent.exe"

# Run directly (for testing)
& "C:\Program Files\SOC-Agent\soc-agent.exe"

# Install as Windows service (requires admin)
sc create "SOC Agent" binPath="C:\Program Files\SOC-Agent\soc-agent.exe" start=auto
sc description "SOC Agent" "SOC Intelligent Security Agent"
sc start "SOC Agent"
```

#### macOS (.dmg)

```bash
# Download from web interface (e.g., soc-agent-macos-x64.dmg)
# Open .dmg file and drag to Applications folder
# Or install via command line:

hdiutil mount soc-agent-macos-x64.dmg
cp -R "/Volumes/SOC Agent/SOC Agent.app" /Applications/
hdiutil unmount "/Volumes/SOC Agent"

# Run directly (for testing)
open "/Applications/SOC Agent.app"

# Install as launch daemon
sudo tee /Library/LaunchDaemons/com.soc.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.soc.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/SOC Agent.app/Contents/MacOS/SOC Agent</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

sudo launchctl load /Library/LaunchDaemons/com.soc.agent.plist
```
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