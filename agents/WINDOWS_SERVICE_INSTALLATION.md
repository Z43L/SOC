# Windows Service Installation Guide

## Manual Windows Service Creation

If you need to install the SOC Agent as a Windows service, use the following commands with proper path quoting to avoid "Cannot find module" errors.

### Using sc command (Administrator Command Prompt required):

```cmd
REM Replace the path with your actual installation path
sc create "SOC-Agent" binPath= "\"C:\Program Files\SOC-Agent\soc-agent-windows.exe\"" start= auto DisplayName= "SOC Intelligent Agent"

REM Set service description
sc description "SOC-Agent" "SOC Intelligent Agent for endpoint monitoring and security"

REM Start the service
sc start "SOC-Agent"
```

### Using PowerShell (Administrator required):

```powershell
# Define service parameters with proper quoting
$serviceName = "SOC-Agent"
$binaryPath = '"C:\Program Files\SOC-Agent\soc-agent-windows.exe"'
$displayName = "SOC Intelligent Agent"
$description = "SOC Intelligent Agent for endpoint monitoring and security"

# Create the service
New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName $displayName -StartupType Automatic -Description $description

# Start the service
Start-Service -Name $serviceName
```

### Troubleshooting Path Issues

If you encounter "Cannot find module 'C:\Program'" errors:

1. **Always use quotes around paths with spaces**
2. **Escape quotes properly in batch files**: `"\"C:\Program Files\SOC-Agent\soc-agent.exe\""`
3. **Consider installing to paths without spaces**: `C:\SOC-Agent\` or `C:\opt\soc-agent\`

### Service Management Commands

```cmd
REM Check service status
sc query "SOC-Agent"

REM Stop the service
sc stop "SOC-Agent"

REM Start the service
sc start "SOC-Agent"

REM Delete the service
sc delete "SOC-Agent"
```

### Alternative Installation Paths (Recommended)

To avoid path quoting issues entirely, install the agent to a path without spaces:

```cmd
REM Example with no spaces in path
C:\SOC-Agent\soc-agent-windows.exe
C:\opt\soc-agent\soc-agent-windows.exe
```

Then the service command becomes simpler:

```cmd
sc create "SOC-Agent" binPath= "C:\SOC-Agent\soc-agent-windows.exe" start= auto DisplayName= "SOC Intelligent Agent"
```