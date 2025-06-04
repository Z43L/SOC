#!/bin/bash
# Post-installation script for SOC Agent

set -e

# Create configuration directory
mkdir -p /etc/soc-agent

# Create default configuration if it doesn't exist
if [ ! -f /etc/soc-agent/agent.yaml ]; then
    cat > /etc/soc-agent/agent.yaml << 'EOF'
# SOC Agent Configuration
serverUrl: "https://soc.example.com"
organizationKey: ""

# Agent identification (automatically populated on registration)
agentId: ""

# Intervals (in seconds)
heartbeatInterval: 60
dataUploadInterval: 300
scanInterval: 3600

# Endpoints
registrationEndpoint: "/api/agents/register"
dataEndpoint: "/api/agents/data"
heartbeatEndpoint: "/api/agents/heartbeat"

# Security
signMessages: false

# Capabilities
capabilities:
  fileSystemMonitoring: true
  processMonitoring: true
  networkMonitoring: true
  registryMonitoring: false
  securityLogsMonitoring: true
  malwareScanning: false
  vulnerabilityScanning: false

# Logging
logFilePath: "agent.log"
maxStorageSize: 100
logLevel: "info"

# Queue
queueSize: 1000

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

# Scanning
directoriesToScan:
  - "/tmp"
  - "/var/tmp"
  - "/dev/shm"
  - "/home"
cpuAlertThreshold: 90
EOF
fi

# Set proper permissions
chmod 600 /etc/soc-agent/agent.yaml
chmod +x /opt/soc-agent/soc-agent

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable soc-agent

# Start the service
systemctl start soc-agent

echo "SOC Agent installed successfully!"
echo "Please edit /etc/soc-agent/agent.yaml to configure your organization key and server URL."
echo "Then restart the service with: sudo systemctl restart soc-agent"