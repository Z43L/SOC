# Ejemplos de Configuración y Uso de Agentes

## Introducción

Esta guía proporciona ejemplos prácticos de configuración y uso de los agentes del SOC-Inteligente para diferentes escenarios y entornos empresariales.

## Índice

- [Configuraciones Básicas](#configuraciones-básicas)
- [Configuraciones por Entorno](#configuraciones-por-entorno)
- [Configuraciones Especializadas](#configuraciones-especializadas)
- [Ejemplos de Despliegue](#ejemplos-de-despliegue)
- [Scripts de Automatización](#scripts-de-automatización)
- [Monitoreo y Alertas](#monitoreo-y-alertas)

---

## Configuraciones Básicas

### Configuración Mínima

Para un entorno de desarrollo o testing:

```json
{
  "serverUrl": "https://soc-demo.empresa.com",
  "registrationKey": "dev-key-12345",
  "heartbeatInterval": 60,
  "dataUploadInterval": 300,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": false,
    "registryMonitoring": false,
    "securityLogsMonitoring": true,
    "malwareScanning": false,
    "vulnerabilityScanning": false
  }
}
```

### Configuración Estándar

Para un entorno de producción típico:

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "prod-key-67890",
  "heartbeatInterval": 60,
  "dataUploadInterval": 180,
  "scanInterval": 3600,
  "logLevel": "warn",
  "maxStorageSize": 500,
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "registryMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "batchSize": 100,
    "maxEventsPerMinute": 200,
    "eventFilters": {
      "minSeverity": "medium",
      "excludeProcesses": ["chrome.exe", "firefox.exe", "teams.exe"]
    }
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "validateServerCertificate": true
  }
}
```

### Configuración de Alto Rendimiento

Para servidores críticos con alta actividad:

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "server-key-critical",
  "heartbeatInterval": 30,
  "dataUploadInterval": 60,
  "scanInterval": 1800,
  "logLevel": "error",
  "maxStorageSize": 1000,
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "registryMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": true
  },
  "collectorsConfig": {
    "batchSize": 500,
    "maxEventsPerMinute": 1000,
    "aggregation": {
      "enabled": true,
      "window": 300,
      "maxSimilarEvents": 5
    },
    "eventFilters": {
      "minSeverity": "low",
      "priorityProcesses": ["svchost.exe", "lsass.exe", "winlogon.exe"],
      "monitoredPaths": [
        "C:\\Windows\\System32",
        "C:\\Program Files",
        "C:\\Users\\*\\AppData\\Roaming"
      ]
    }
  },
  "resourceLimits": {
    "maxCpuUsage": 10,
    "maxMemoryUsage": 256,
    "throttleOnHighUsage": true
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "validateServerCertificate": true,
    "tamperProtection": true
  }
}
```

---

## Configuraciones por Entorno

### Entorno Corporativo con Proxy

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "corp-key-proxy",
  "proxy": {
    "enabled": true,
    "host": "proxy.empresa.com",
    "port": 8080,
    "username": "soc-agent",
    "password": "proxy-password-encrypted",
    "bypassList": ["localhost", "127.0.0.1", "*.local", "10.*"]
  },
  "ssl": {
    "verifyPeer": true,
    "caCertPath": "/etc/ssl/certs/enterprise-ca.pem",
    "allowSelfSigned": false
  },
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "registryMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": true
  },
  "collectorsConfig": {
    "windows": {
      "eventLog": {
        "enabled": true,
        "channels": ["Security", "System", "Application", "Windows PowerShell"],
        "eventIds": {
          "include": [4624, 4625, 4648, 4656, 4672, 4688, 4698, 4719, 4720, 4738],
          "exclude": [4634, 4647]
        }
      },
      "registry": {
        "enabled": true,
        "monitoredKeys": [
          "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
          "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
          "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
          "HKLM\\SYSTEM\\CurrentControlSet\\Services"
        ]
      },
      "processes": {
        "enabled": true,
        "interval": 30,
        "suspiciousPatterns": [
          "powershell.*-EncodedCommand",
          "cmd.*echo.*\\|.*powershell",
          ".*\\.tmp\\.exe$",
          ".*\\.scr$"
        ]
      }
    }
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "validateServerCertificate": true,
    "allowedNetworks": ["10.0.0.0/8", "192.168.0.0/16"]
  }
}
```

### Entorno Linux/Servidor Web

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "linux-web-server",
  "heartbeatInterval": 60,
  "dataUploadInterval": 120,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "linux": {
      "syslog": {
        "enabled": true,
        "sources": ["/var/log/syslog", "/var/log/auth.log", "/var/log/nginx/access.log", "/var/log/nginx/error.log"],
        "patterns": {
          "suspicious": [
            "failed password",
            "authentication failure",
            "invalid user",
            "possible break-in attempt",
            "SQL injection",
            "XSS attack"
          ]
        }
      },
      "processes": {
        "enabled": true,
        "interval": 60,
        "monitoredProcesses": ["nginx", "apache2", "mysql", "postgresql", "ssh"],
        "suspiciousCommands": [
          "wget.*\\|.*sh",
          "curl.*\\|.*bash",
          "nc.*-l.*-p",
          "python.*-c.*socket"
        ]
      },
      "fileSystem": {
        "enabled": true,
        "monitoredPaths": [
          "/var/www",
          "/etc/nginx",
          "/etc/apache2",
          "/etc/ssh",
          "/etc/passwd",
          "/etc/shadow",
          "/tmp",
          "/var/tmp"
        ],
        "excludePaths": [
          "/var/www/html/cache",
          "/var/www/html/tmp"
        ]
      },
      "network": {
        "enabled": true,
        "monitoredPorts": [22, 80, 443, 3306, 5432],
        "suspiciousConnections": {
          "detectPortScans": true,
          "detectBruteForce": true,
          "maxConnectionsPerIP": 100
        }
      }
    }
  },
  "directoriesToScan": ["/tmp", "/var/tmp", "/dev/shm", "/var/www/uploads"],
  "cpuAlertThreshold": 80,
  "security": {
    "signMessages": true,
    "tamperProtection": true
  }
}
```

### Entorno macOS/Estación de Trabajo

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "macos-workstation",
  "heartbeatInterval": 120,
  "dataUploadInterval": 300,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": false,
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "macos": {
      "console": {
        "enabled": true,
        "categories": ["security", "system", "network"],
        "subsystems": ["com.apple.securityd", "com.apple.kernel"]
      },
      "endpointSecurity": {
        "enabled": true,
        "events": ["file", "process", "network"],
        "excludeApps": [
          "com.apple.Safari",
          "com.google.Chrome",
          "com.microsoft.teams",
          "com.slack.Slack"
        ]
      },
      "launchDaemons": {
        "enabled": true,
        "monitoredPaths": [
          "/Library/LaunchDaemons",
          "/System/Library/LaunchDaemons",
          "/Library/LaunchAgents",
          "/System/Library/LaunchAgents"
        ]
      },
      "keychain": {
        "enabled": true,
        "monitoredEvents": ["create", "delete", "modify", "access"]
      }
    }
  },
  "directoriesToScan": [
    "/tmp",
    "/var/tmp",
    "/Users/*/Downloads",
    "/Applications"
  ],
  "security": {
    "signMessages": true,
    "validateServerCertificate": true
  }
}
```

---

## Configuraciones Especializadas

### Servidor de Base de Datos

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "database-server-key",
  "heartbeatInterval": 30,
  "dataUploadInterval": 60,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": true
  },
  "collectorsConfig": {
    "database": {
      "mysql": {
        "enabled": true,
        "connection": {
          "host": "localhost",
          "port": 3306,
          "user": "soc_monitor",
          "password": "encrypted_password",
          "database": "mysql"
        },
        "monitoring": {
          "slowQueries": {
            "enabled": true,
            "threshold": 5.0
          },
          "failedLogins": {
            "enabled": true,
            "maxAttempts": 5
          },
          "privilegeChanges": {
            "enabled": true,
            "monitoredTables": ["user", "db", "tables_priv"]
          },
          "suspiciousQueries": {
            "enabled": true,
            "patterns": [
              "DROP\\s+DATABASE",
              "DELETE\\s+FROM.*WHERE\\s+1\\s*=\\s*1",
              "GRANT\\s+ALL",
              "CREATE\\s+USER.*IDENTIFIED\\s+BY"
            ]
          }
        }
      }
    },
    "processes": {
      "enabled": true,
      "criticalProcesses": ["mysqld", "postgres", "oracle"],
      "alertOnTermination": true
    },
    "fileSystem": {
      "enabled": true,
      "monitoredPaths": [
        "/var/lib/mysql",
        "/etc/mysql",
        "/var/log/mysql"
      ],
      "criticalFiles": [
        "/etc/mysql/my.cnf",
        "/var/lib/mysql/mysql/user.frm"
      ]
    },
    "network": {
      "enabled": true,
      "monitoredPorts": [3306, 5432, 1521],
      "alertOnUnauthorizedConnections": true,
      "maxConnectionsPerIP": 50
    }
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "tamperProtection": true,
    "allowedNetworks": ["10.0.0.0/8", "192.168.1.0/24"]
  }
}
```

### Controlador de Dominio (Active Directory)

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "domain-controller-key",
  "heartbeatInterval": 30,
  "dataUploadInterval": 60,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "registryMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": true
  },
  "collectorsConfig": {
    "windows": {
      "eventLog": {
        "enabled": true,
        "channels": [
          "Security",
          "System", 
          "Application",
          "Directory Service",
          "DNS Server",
          "DFS Replication"
        ],
        "criticalEventIds": [
          4624, 4625, 4648, 4672, 4688, 4698, 4719, 4720, 4738, 4756,
          4767, 4768, 4769, 4771, 4776, 4778, 4779, 4964, 5136, 5137,
          5139, 5141
        ],
        "realTimeMonitoring": true
      },
      "activeDirectory": {
        "enabled": true,
        "monitoring": {
          "userCreation": true,
          "userDeletion": true,
          "groupMembership": true,
          "privilegeChanges": true,
          "passwordChanges": true,
          "accountLockouts": true,
          "logonFailures": {
            "enabled": true,
            "threshold": 5,
            "timeWindow": 300
          }
        },
        "criticalGroups": [
          "Domain Admins",
          "Enterprise Admins",
          "Schema Admins",
          "Account Operators",
          "Backup Operators",
          "Server Operators"
        ]
      },
      "registry": {
        "enabled": true,
        "monitoredKeys": [
          "HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS",
          "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
          "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa"
        ]
      },
      "processes": {
        "enabled": true,
        "criticalProcesses": ["lsass.exe", "ntds.exe", "dns.exe"],
        "alertOnTermination": true,
        "monitorMemoryInjection": true
      }
    },
    "fileSystem": {
      "enabled": true,
      "monitoredPaths": [
        "C:\\Windows\\SYSVOL",
        "C:\\Windows\\NTDS",
        "C:\\Windows\\System32\\config"
      ],
      "criticalFiles": [
        "C:\\Windows\\NTDS\\ntds.dit",
        "C:\\Windows\\System32\\config\\SAM",
        "C:\\Windows\\System32\\config\\SECURITY"
      ]
    }
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "tamperProtection": true,
    "processProtection": true,
    "allowedNetworks": ["10.0.0.0/8"]
  }
}
```

### Servidor de Aplicaciones (IIS/Apache)

```json
{
  "serverUrl": "https://soc.empresa.com",
  "registrationKey": "web-app-server-key",
  "heartbeatInterval": 60,
  "dataUploadInterval": 120,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "webServer": {
      "iis": {
        "enabled": true,
        "logPaths": [
          "C:\\inetpub\\logs\\LogFiles\\W3SVC1",
          "C:\\inetpub\\logs\\LogFiles\\W3SVC2"
        ],
        "monitoring": {
          "attackPatterns": {
            "sqlInjection": true,
            "xss": true,
            "pathTraversal": true,
            "commandInjection": true
          },
          "anomalies": {
            "longUrls": 1000,
            "highErrorRates": 10,
            "suspiciousUserAgents": true
          },
          "rateLimiting": {
            "requestsPerMinute": 1000,
            "errorsPerMinute": 100
          }
        }
      },
      "application": {
        "enabled": true,
        "monitoredApps": [
          {
            "name": "MainWebApp",
            "path": "C:\\inetpub\\wwwroot\\mainapp",
            "logFile": "C:\\inetpub\\wwwroot\\mainapp\\logs\\app.log",
            "criticalFiles": [
              "web.config",
              "Global.asax",
              "bin\\*.dll"
            ]
          }
        ],
        "monitoring": {
          "fileChanges": true,
          "configChanges": true,
          "errorRates": true,
          "performanceMetrics": true
        }
      }
    },
    "processes": {
      "enabled": true,
      "criticalProcesses": ["w3wp.exe", "iisexpress.exe"],
      "monitoredProcesses": ["aspnet_wp.exe", "httpd.exe"],
      "alertOnCrash": true
    },
    "fileSystem": {
      "enabled": true,
      "monitoredPaths": [
        "C:\\inetpub\\wwwroot",
        "C:\\Windows\\Microsoft.NET\\Framework",
        "C:\\Windows\\Microsoft.NET\\Framework64"
      ],
      "uploadDirectories": [
        "C:\\inetpub\\wwwroot\\uploads",
        "C:\\inetpub\\wwwroot\\temp"
      ],
      "scanUploads": true
    }
  },
  "security": {
    "signMessages": true,
    "encryptCommunication": true,
    "webProtection": {
      "scanUploads": true,
      "blockSuspiciousFiles": true,
      "quarantineThreats": true
    }
  }
}
```

---

## Ejemplos de Despliegue

### Despliegue Masivo con PowerShell (Windows)

```powershell
# deploy-agents.ps1
param(
    [Parameter(Mandatory=$true)]
    [string[]]$ComputerNames,
    
    [Parameter(Mandatory=$true)]
    [string]$RegistrationKey,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [string]$SourcePath = "\\fileserver\soc-agent\soc-agent-installer.msi",
    [string]$ConfigTemplate = "\\fileserver\soc-agent\config-template.json"
)

$ErrorActionPreference = "Stop"

# Función para desplegar en un equipo
function Deploy-Agent {
    param($ComputerName)
    
    Write-Host "Desplegando agente en $ComputerName..." -ForegroundColor Yellow
    
    try {
        # Verificar conectividad
        if (-not (Test-Connection -ComputerName $ComputerName -Count 1 -Quiet)) {
            throw "No se puede conectar a $ComputerName"
        }
        
        # Copiar instalador
        $session = New-PSSession -ComputerName $ComputerName
        Copy-Item -Path $SourcePath -Destination "C:\Temp\soc-agent-installer.msi" -ToSession $session
        
        # Instalar agente
        Invoke-Command -Session $session -ScriptBlock {
            Start-Process -FilePath "msiexec.exe" -ArgumentList "/i C:\Temp\soc-agent-installer.msi /quiet /l*v C:\Temp\install.log" -Wait
        }
        
        # Configurar agente
        $config = Get-Content $ConfigTemplate | ConvertFrom-Json
        $config.serverUrl = $ServerUrl
        $config.registrationKey = $RegistrationKey
        $config.agentId = $null  # Forzar re-registro
        
        $configJson = $config | ConvertTo-Json -Depth 10
        Invoke-Command -Session $session -ScriptBlock {
            param($ConfigContent)
            $ConfigContent | Out-File -FilePath "C:\Program Files\SOC-Agent\agent-config.json" -Encoding UTF8
        } -ArgumentList $configJson
        
        # Iniciar servicio
        Invoke-Command -Session $session -ScriptBlock {
            Start-Service -Name "SOC-Agent"
        }
        
        # Verificar instalación
        $serviceStatus = Invoke-Command -Session $session -ScriptBlock {
            Get-Service -Name "SOC-Agent" | Select-Object Status
        }
        
        Remove-PSSession $session
        
        if ($serviceStatus.Status -eq "Running") {
            Write-Host "✓ Agente desplegado correctamente en $ComputerName" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ Error: Servicio no está corriendo en $ComputerName" -ForegroundColor Red
            return $false
        }
        
    } catch {
        Write-Host "✗ Error desplegando en $ComputerName : $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Despliegue en paralelo
$jobs = @()
foreach ($computer in $ComputerNames) {
    $jobs += Start-Job -ScriptBlock ${function:Deploy-Agent} -ArgumentList $computer
}

# Esperar resultados
$results = @{}
foreach ($job in $jobs) {
    $result = Receive-Job -Job $job -Wait
    $computerName = $job.Name
    $results[$computerName] = $result
    Remove-Job $job
}

# Reporte final
Write-Host "`n=== REPORTE DE DESPLIEGUE ===" -ForegroundColor Cyan
$successful = ($results.Values | Where-Object { $_ -eq $true }).Count
$failed = ($results.Values | Where-Object { $_ -eq $false }).Count

Write-Host "Exitosos: $successful" -ForegroundColor Green
Write-Host "Fallidos: $failed" -ForegroundColor Red

if ($failed -gt 0) {
    Write-Host "`nEquipos fallidos:" -ForegroundColor Red
    $results.GetEnumerator() | Where-Object { $_.Value -eq $false } | ForEach-Object {
        Write-Host "  - $($_.Key)" -ForegroundColor Red
    }
}
```

### Despliegue con Ansible (Linux)

```yaml
# deploy-soc-agents.yml
---
- name: Deploy SOC Agents
  hosts: linux_servers
  become: yes
  vars:
    soc_server_url: "https://soc.empresa.com"
    registration_key: "{{ vault_registration_key }}"
    agent_version: "1.2.3"
    
  tasks:
    - name: Create soc-agent user
      user:
        name: soc-agent
        system: yes
        shell: /bin/false
        home: /opt/soc-agent
        create_home: no
        
    - name: Create directories
      file:
        path: "{{ item }}"
        state: directory
        owner: soc-agent
        group: soc-agent
        mode: '0755'
      loop:
        - /opt/soc-agent
        - /opt/soc-agent/bin
        - /opt/soc-agent/config
        - /opt/soc-agent/logs
        - /var/lib/soc-agent
        
    - name: Download SOC Agent binary
      get_url:
        url: "https://releases.soc-inteligente.com/agent/linux/{{ agent_version }}/soc-agent"
        dest: /opt/soc-agent/bin/soc-agent
        mode: '0755'
        owner: soc-agent
        group: soc-agent
        
    - name: Template agent configuration
      template:
        src: agent-config.json.j2
        dest: /opt/soc-agent/config/agent-config.json
        owner: soc-agent
        group: soc-agent
        mode: '0644'
      notify: restart soc-agent
      
    - name: Install systemd service file
      template:
        src: soc-agent.service.j2
        dest: /etc/systemd/system/soc-agent.service
        mode: '0644'
      notify:
        - reload systemd
        - restart soc-agent
        
    - name: Enable and start SOC Agent service
      systemd:
        name: soc-agent
        enabled: yes
        state: started
        daemon_reload: yes
        
    - name: Verify agent registration
      uri:
        url: "{{ soc_server_url }}/api/agents/{{ ansible_hostname }}/status"
        method: GET
        timeout: 30
      register: agent_status
      retries: 5
      delay: 10
      
    - name: Display registration status
      debug:
        msg: "Agent {{ ansible_hostname }} registration status: {{ agent_status.json.status }}"
        
  handlers:
    - name: reload systemd
      systemd:
        daemon_reload: yes
        
    - name: restart soc-agent
      systemd:
        name: soc-agent
        state: restarted
```

**Archivo de template de configuración (agent-config.json.j2):**

```json
{
  "serverUrl": "{{ soc_server_url }}",
  "registrationKey": "{{ registration_key }}",
  "heartbeatInterval": 60,
  "dataUploadInterval": 180,
  "logLevel": "info",
  "logFilePath": "/opt/soc-agent/logs/agent.log",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": {% if ansible_memtotal_mb > 2048 %}true{% else %}false{% endif %},
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "linux": {
      "syslog": {
        "enabled": true,
        "sources": ["/var/log/syslog", "/var/log/auth.log"]
      },
      "processes": {
        "enabled": true,
        "interval": 60
      },
      "fileSystem": {
        "enabled": true,
        "monitoredPaths": ["/tmp", "/var/tmp", "/etc"]
      }
    }
  },
  "directoriesToScan": ["/tmp", "/var/tmp", "/dev/shm"],
  "cpuAlertThreshold": {% if 'web' in group_names %}80{% else %}90{% endif %},
  "security": {
    "signMessages": true,
    "validateServerCertificate": true
  }
}
```

---

## Scripts de Automatización

### Script de Configuración Automática

```bash
#!/bin/bash
# auto-configure-agent.sh

set -e

# Configuración
SOC_SERVER_URL=""
REGISTRATION_KEY=""
ENVIRONMENT=""
ROLE=""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Función para detectar el tipo de sistema
detect_system_type() {
    local cpu_cores=$(nproc)
    local memory_gb=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024 ))
    local is_server=false
    
    # Detectar si es un servidor
    if systemctl list-units --type=service | grep -E "(apache|nginx|mysql|postgresql|docker)" > /dev/null; then
        is_server=true
    fi
    
    # Clasificar el sistema
    if [ "$is_server" = true ]; then
        if [ $memory_gb -gt 8 ] && [ $cpu_cores -gt 4 ]; then
            echo "high-performance-server"
        else
            echo "standard-server"
        fi
    else
        if [ $memory_gb -gt 4 ]; then
            echo "workstation"
        else
            echo "basic-endpoint"
        fi
    fi
}

# Función para generar configuración según el tipo de sistema
generate_config() {
    local system_type=$1
    local config_file="/opt/soc-agent/config/agent-config.json"
    
    log "Generando configuración para: $system_type"
    
    case $system_type in
        "high-performance-server")
            cat > "$config_file" << EOF
{
  "serverUrl": "$SOC_SERVER_URL",
  "registrationKey": "$REGISTRATION_KEY",
  "heartbeatInterval": 30,
  "dataUploadInterval": 60,
  "scanInterval": 1800,
  "logLevel": "warn",
  "maxStorageSize": 1000,
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": true
  },
  "collectorsConfig": {
    "batchSize": 500,
    "maxEventsPerMinute": 1000,
    "aggregation": {
      "enabled": true,
      "window": 300,
      "maxSimilarEvents": 5
    }
  },
  "resourceLimits": {
    "maxCpuUsage": 10,
    "maxMemoryUsage": 256,
    "throttleOnHighUsage": true
  }
}
EOF
            ;;
            
        "standard-server")
            cat > "$config_file" << EOF
{
  "serverUrl": "$SOC_SERVER_URL",
  "registrationKey": "$REGISTRATION_KEY",
  "heartbeatInterval": 60,
  "dataUploadInterval": 180,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": true,
    "securityLogsMonitoring": true,
    "malwareScanning": true,
    "vulnerabilityScanning": false
  },
  "collectorsConfig": {
    "batchSize": 100,
    "maxEventsPerMinute": 200
  },
  "resourceLimits": {
    "maxCpuUsage": 15,
    "maxMemoryUsage": 128
  }
}
EOF
            ;;
            
        "workstation")
            cat > "$config_file" << EOF
{
  "serverUrl": "$SOC_SERVER_URL",
  "registrationKey": "$REGISTRATION_KEY",
  "heartbeatInterval": 120,
  "dataUploadInterval": 300,
  "logLevel": "info",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": false,
    "securityLogsMonitoring": true,
    "malwareScanning": false,
    "vulnerabilityScanning": false
  },
  "directoriesToScan": ["/tmp", "/var/tmp", "\$HOME/Downloads"],
  "resourceLimits": {
    "maxCpuUsage": 20,
    "maxMemoryUsage": 64
  }
}
EOF
            ;;
            
        "basic-endpoint")
            cat > "$config_file" << EOF
{
  "serverUrl": "$SOC_SERVER_URL",
  "registrationKey": "$REGISTRATION_KEY",
  "heartbeatInterval": 300,
  "dataUploadInterval": 600,
  "logLevel": "warn",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": false,
    "securityLogsMonitoring": false,
    "malwareScanning": false,
    "vulnerabilityScanning": false
  },
  "resourceLimits": {
    "maxCpuUsage": 25,
    "maxMemoryUsage": 32
  }
}
EOF
            ;;
    esac
    
    chown soc-agent:soc-agent "$config_file"
    chmod 644 "$config_file"
}

# Función principal
main() {
    # Verificar parámetros
    while [[ $# -gt 0 ]]; do
        case $1 in
            --server-url)
                SOC_SERVER_URL="$2"
                shift 2
                ;;
            --registration-key)
                REGISTRATION_KEY="$2"
                shift 2
                ;;
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --role)
                ROLE="$2"
                shift 2
                ;;
            *)
                error "Parámetro desconocido: $1"
                ;;
        esac
    done
    
    # Validar parámetros requeridos
    if [ -z "$SOC_SERVER_URL" ] || [ -z "$REGISTRATION_KEY" ]; then
        error "Se requieren --server-url y --registration-key"
    fi
    
    log "Iniciando configuración automática del agente SOC"
    
    # Detectar tipo de sistema
    local system_type=$(detect_system_type)
    log "Tipo de sistema detectado: $system_type"
    
    # Verificar que el agente está instalado
    if [ ! -f "/opt/soc-agent/bin/soc-agent" ]; then
        error "Agente SOC no está instalado"
    fi
    
    # Generar configuración
    generate_config "$system_type"
    
    # Reiniciar servicio
    log "Reiniciando servicio del agente"
    systemctl restart soc-agent
    
    # Verificar que está corriendo
    sleep 5
    if systemctl is-active --quiet soc-agent; then
        log "Agente configurado y corriendo correctamente"
    else
        error "El agente no pudo iniciarse"
    fi
    
    # Verificar conectividad
    log "Verificando conectividad con el servidor"
    if curl -f -s "$SOC_SERVER_URL/api/health" > /dev/null; then
        log "Conectividad verificada correctamente"
    else
        warn "No se pudo verificar la conectividad con el servidor"
    fi
    
    log "Configuración automática completada"
}

# Ejecutar función principal
main "$@"
```

### Script de Mantenimiento

```bash
#!/bin/bash
# maintenance-agent.sh

# Configuración
AGENT_DIR="/opt/soc-agent"
LOG_DIR="$AGENT_DIR/logs"
CONFIG_FILE="$AGENT_DIR/config/agent-config.json"
MAX_LOG_SIZE="50M"
MAX_LOG_FILES=5
BACKUP_DIR="/var/backups/soc-agent"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Función para limpiar logs antiguos
cleanup_logs() {
    log "Iniciando limpieza de logs"
    
    # Crear directorio de backup si no existe
    mkdir -p "$BACKUP_DIR"
    
    # Rotar logs grandes
    for logfile in "$LOG_DIR"/*.log; do
        if [ -f "$logfile" ] && [ $(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile") -gt $(numfmt --from=iec $MAX_LOG_SIZE) ]; then
            log "Rotando archivo de log: $logfile"
            
            # Comprimir y mover a backup
            gzip -c "$logfile" > "$BACKUP_DIR/$(basename $logfile).$(date +%Y%m%d_%H%M%S).gz"
            
            # Truncar archivo original
            > "$logfile"
        fi
    done
    
    # Eliminar backups antiguos (más de 30 días)
    find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
    
    log "Limpieza de logs completada"
}

# Función para verificar salud del agente
check_agent_health() {
    log "Verificando salud del agente"
    
    local issues=0
    
    # Verificar que el servicio está corriendo
    if ! systemctl is-active --quiet soc-agent; then
        log "WARNING: El servicio no está corriendo"
        issues=$((issues + 1))
    fi
    
    # Verificar uso de memoria
    local memory_usage=$(ps -p $(pgrep soc-agent) -o %mem --no-headers 2>/dev/null | tr -d ' ')
    if [ -n "$memory_usage" ] && [ $(echo "$memory_usage > 30" | bc -l 2>/dev/null) -eq 1 ]; then
        log "WARNING: Alto uso de memoria: ${memory_usage}%"
        issues=$((issues + 1))
    fi
    
    # Verificar actividad reciente
    local recent_logs=$(journalctl -u soc-agent --since "5 minutes ago" | wc -l)
    if [ $recent_logs -eq 0 ]; then
        log "WARNING: No hay actividad reciente en los logs"
        issues=$((issues + 1))
    fi
    
    # Verificar conectividad
    local server_url=$(grep -o '"serverUrl": *"[^"]*"' "$CONFIG_FILE" 2>/dev/null | cut -d'"' -f4)
    if [ -n "$server_url" ]; then
        if ! curl -f -s "$server_url/api/health" > /dev/null; then
            log "WARNING: No se puede conectar al servidor SOC"
            issues=$((issues + 1))
        fi
    fi
    
    if [ $issues -eq 0 ]; then
        log "Agente funcionando correctamente"
    else
        log "Se encontraron $issues problemas"
    fi
    
    return $issues
}

# Función para optimizar configuración
optimize_config() {
    log "Optimizando configuración"
    
    # Backup de configuración actual
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Leer configuración actual
    local config=$(cat "$CONFIG_FILE")
    
    # Detectar si el sistema está bajo carga
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    
    # Ajustar intervalos si el sistema está sobrecargado
    if [ $(echo "$cpu_usage > 80" | bc -l 2>/dev/null) -eq 1 ] || [ $memory_usage -gt 90 ]; then
        log "Sistema sobrecargado, ajustando intervalos"
        
        # Aumentar intervalos para reducir carga
        config=$(echo "$config" | jq '.heartbeatInterval = 120 | .dataUploadInterval = 600')
    fi
    
    # Guardar configuración optimizada
    echo "$config" > "$CONFIG_FILE"
    
    log "Configuración optimizada"
}

# Función para actualizar agente
update_agent() {
    log "Verificando actualizaciones del agente"
    
    local current_version=$(/opt/soc-agent/bin/soc-agent --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    local latest_version=$(curl -s https://api.github.com/repos/empresa/soc-agent/releases/latest | jq -r '.tag_name' | sed 's/v//')
    
    if [ "$current_version" != "$latest_version" ] && [ -n "$latest_version" ]; then
        log "Nueva versión disponible: $latest_version (actual: $current_version)"
        
        # Descargar nueva versión
        local temp_binary="/tmp/soc-agent-new"
        if curl -L -o "$temp_binary" "https://releases.soc-inteligente.com/agent/linux/$latest_version/soc-agent"; then
            chmod +x "$temp_binary"
            
            # Verificar que el binario funciona
            if "$temp_binary" --version > /dev/null 2>&1; then
                log "Actualizando agente a versión $latest_version"
                
                # Detener servicio
                systemctl stop soc-agent
                
                # Backup del binario actual
                cp "/opt/soc-agent/bin/soc-agent" "/opt/soc-agent/bin/soc-agent.backup.$(date +%Y%m%d_%H%M%S)"
                
                # Instalar nueva versión
                mv "$temp_binary" "/opt/soc-agent/bin/soc-agent"
                chown soc-agent:soc-agent "/opt/soc-agent/bin/soc-agent"
                
                # Reiniciar servicio
                systemctl start soc-agent
                
                log "Agente actualizado exitosamente"
            else
                log "ERROR: El nuevo binario no funciona correctamente"
                rm -f "$temp_binary"
            fi
        else
            log "ERROR: No se pudo descargar la nueva versión"
        fi
    else
        log "Agente está actualizado (versión $current_version)"
    fi
}

# Función principal
main() {
    log "Iniciando mantenimiento del agente SOC"
    
    # Realizar tareas de mantenimiento
    cleanup_logs
    check_agent_health
    optimize_config
    
    # Solo actualizar si se especifica
    if [ "$1" = "--update" ]; then
        update_agent
    fi
    
    # Reiniciar servicio para aplicar cambios
    systemctl restart soc-agent
    
    log "Mantenimiento completado"
}

# Ejecutar función principal
main "$@"
```

---

## Monitoreo y Alertas

### Dashboard de Monitoreo en Tiempo Real

```bash
#!/bin/bash
# agent-dashboard.sh

# Configuración
REFRESH_INTERVAL=5
LOG_LINES=10

# Función para obtener estadísticas
get_stats() {
    local pid=$(pgrep soc-agent)
    
    if [ -n "$pid" ]; then
        echo "PID:$pid"
        echo "CPU:$(ps -p $pid -o %cpu --no-headers | tr -d ' ')%"
        echo "MEM:$(ps -p $pid -o %mem --no-headers | tr -d ' ')%"
        echo "RSS:$(ps -p $pid -o rss --no-headers | tr -d ' ')KB"
        echo "UPTIME:$(ps -p $pid -o etime --no-headers | tr -d ' ')"
    else
        echo "PID:N/A"
        echo "CPU:0%"
        echo "MEM:0%"
        echo "RSS:0KB"
        echo "UPTIME:N/A"
    fi
}

# Función para mostrar dashboard
show_dashboard() {
    clear
    
    local stats=$(get_stats)
    local pid=$(echo "$stats" | grep "PID:" | cut -d: -f2)
    local cpu=$(echo "$stats" | grep "CPU:" | cut -d: -f2)
    local mem=$(echo "$stats" | grep "MEM:" | cut -d: -f2)
    local rss=$(echo "$stats" | grep "RSS:" | cut -d: -f2)
    local uptime=$(echo "$stats" | grep "UPTIME:" | cut -d: -f2)
    
    local service_status=$(systemctl is-active soc-agent 2>/dev/null || echo "inactive")
    local service_enabled=$(systemctl is-enabled soc-agent 2>/dev/null || echo "disabled")
    
    echo "╔════════════════════════════════════════════════════════════════════════════════╗"
    echo "║                           SOC AGENT DASHBOARD                                 ║"
    echo "╠════════════════════════════════════════════════════════════════════════════════╣"
    echo "║ Actualizado: $(date +'%Y-%m-%d %H:%M:%S')                                           ║"
    echo "╚════════════════════════════════════════════════════════════════════════════════╝"
    echo
    
    # Estado del servicio
    echo "┌─ ESTADO DEL SERVICIO ─────────────────────────────────────────────────────────┐"
    if [ "$service_status" = "active" ]; then
        echo "│ Estado: 🟢 ACTIVO                                                             │"
    else
        echo "│ Estado: 🔴 INACTIVO                                                           │"
    fi
    echo "│ Habilitado: $([ "$service_enabled" = "enabled" ] && echo "✅ SÍ" || echo "❌ NO")                                                          │"
    echo "│ Tiempo activo: $uptime                                                    │"
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
    
    # Recursos del proceso
    echo "┌─ RECURSOS DEL PROCESO ────────────────────────────────────────────────────────┐"
    echo "│ PID: $pid                                                                    │"
    echo "│ CPU: $cpu                                                                     │"
    echo "│ Memoria: $mem ($rss)                                                      │"
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
    
    # Estadísticas de eventos (última hora)
    echo "┌─ ESTADÍSTICAS DE EVENTOS (Última hora) ───────────────────────────────────────┐"
    local events_sent=$(journalctl -u soc-agent --since "1 hour ago" | grep -c "events sent" || echo "0")
    local heartbeats=$(journalctl -u soc-agent --since "1 hour ago" | grep -c "heartbeat" || echo "0")
    local errors=$(journalctl -u soc-agent --since "1 hour ago" | grep -c -i "error" || echo "0")
    local warnings=$(journalctl -u soc-agent --since "1 hour ago" | grep -c -i "warning" || echo "0")
    
    echo "│ Eventos enviados: $events_sent                                                   │"
    echo "│ Heartbeats: $heartbeats                                                         │"
    echo "│ Errores: $errors                                                               │"
    echo "│ Advertencias: $warnings                                                        │"
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
    
    # Últimos logs
    echo "┌─ ÚLTIMOS LOGS ────────────────────────────────────────────────────────────────┐"
    journalctl -u soc-agent --since "10 minutes ago" --no-pager | tail -$LOG_LINES | while IFS= read -r line; do
        # Truncar líneas largas
        local truncated=$(echo "$line" | cut -c1-76)
        echo "│ $truncated"
    done
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
    
    # Conectividad
    echo "┌─ CONECTIVIDAD ────────────────────────────────────────────────────────────────┐"
    local server_url=$(grep -o '"serverUrl": *"[^"]*"' /opt/soc-agent/config/agent-config.json 2>/dev/null | cut -d'"' -f4)
    if [ -n "$server_url" ]; then
        echo "│ Servidor: $server_url                                              │"
        if curl -f -s "$server_url/api/health" --connect-timeout 5 > /dev/null 2>&1; then
            echo "│ Conectividad: 🟢 OK                                                           │"
        else
            echo "│ Conectividad: 🔴 ERROR                                                        │"
        fi
    else
        echo "│ Servidor: No configurado                                                      │"
        echo "│ Conectividad: ❓ DESCONOCIDO                                                   │"
    fi
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
    
    echo "Presiona Ctrl+C para salir, o espera $REFRESH_INTERVAL segundos para actualizar..."
}

# Loop principal
while true; do
    show_dashboard
    sleep $REFRESH_INTERVAL
done
```

### Sistema de Alertas

```bash
#!/bin/bash
# alert-system.sh

# Configuración
ALERT_EMAIL="admin@empresa.com"
ALERT_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=70
ALERT_THRESHOLD_ERRORS=10

# Función para enviar alerta por email
send_email_alert() {
    local subject="$1"
    local message="$2"
    local priority="$3"
    
    {
        echo "Subject: [SOC-AGENT] $subject"
        echo "Priority: $priority"
        echo "Content-Type: text/html"
        echo ""
        echo "<h2>Alerta del Agente SOC</h2>"
        echo "<p><strong>Servidor:</strong> $(hostname)</p>"
        echo "<p><strong>Fecha:</strong> $(date)</p>"
        echo "<p><strong>Mensaje:</strong></p>"
        echo "<pre>$message</pre>"
    } | sendmail "$ALERT_EMAIL"
}

# Función para enviar alerta a Slack
send_slack_alert() {
    local title="$1"
    local message="$2"
    local color="$3"
    
    local payload=$(cat << EOF
{
  "attachments": [
    {
      "color": "$color",
      "title": "$title",
      "text": "$message",
      "fields": [
        {
          "title": "Servidor",
          "value": "$(hostname)",
          "short": true
        },
        {
          "title": "Fecha",
          "value": "$(date)",
          "short": true
        }
      ]
    }
  ]
}
EOF
)
    
    curl -X POST -H 'Content-type: application/json' \
         --data "$payload" \
         "$ALERT_WEBHOOK" \
         > /dev/null 2>&1
}

# Función para verificar alertas
check_alerts() {
    local alerts_triggered=false
    
    # Verificar si el servicio está corriendo
    if ! systemctl is-active --quiet soc-agent; then
        send_email_alert "Servicio Detenido" "El servicio SOC-Agent se ha detenido" "High"
        send_slack_alert "🔴 Servicio SOC-Agent Detenido" "El servicio se ha detenido en $(hostname)" "danger"
        alerts_triggered=true
    fi
    
    # Verificar uso de CPU
    local pid=$(pgrep soc-agent)
    if [ -n "$pid" ]; then
        local cpu_usage=$(ps -p $pid -o %cpu --no-headers | tr -d ' ' | cut -d. -f1)
        if [ "$cpu_usage" -gt "$ALERT_THRESHOLD_CPU" ]; then
            send_slack_alert "⚠️ Alto Uso de CPU" "CPU del agente: ${cpu_usage}%" "warning"
            alerts_triggered=true
        fi
        
        # Verificar uso de memoria
        local mem_usage=$(ps -p $pid -o %mem --no-headers | tr -d ' ' | cut -d. -f1)
        if [ "$mem_usage" -gt "$ALERT_THRESHOLD_MEMORY" ]; then
            send_slack_alert "⚠️ Alto Uso de Memoria" "Memoria del agente: ${mem_usage}%" "warning"
            alerts_triggered=true
        fi
    fi
    
    # Verificar errores recientes
    local recent_errors=$(journalctl -u soc-agent --since "1 hour ago" | grep -c -i "error" || echo "0")
    if [ "$recent_errors" -gt "$ALERT_THRESHOLD_ERRORS" ]; then
        send_email_alert "Múltiples Errores" "Se detectaron $recent_errors errores en la última hora" "Medium"
        send_slack_alert "⚠️ Múltiples Errores" "Se detectaron $recent_errors errores en la última hora" "warning"
        alerts_triggered=true
    fi
    
    # Verificar conectividad
    local server_url=$(grep -o '"serverUrl": *"[^"]*"' /opt/soc-agent/config/agent-config.json 2>/dev/null | cut -d'"' -f4)
    if [ -n "$server_url" ]; then
        if ! curl -f -s "$server_url/api/health" --connect-timeout 10 > /dev/null 2>&1; then
            send_email_alert "Error de Conectividad" "No se puede conectar al servidor SOC" "High"
            send_slack_alert "🔴 Error de Conectividad" "No se puede conectar al servidor SOC" "danger"
            alerts_triggered=true
        fi
    fi
    
    # Verificar espacio en disco
    local disk_usage=$(df /opt/soc-agent | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 90 ]; then
        send_slack_alert "⚠️ Espacio en Disco Bajo" "Uso de disco: ${disk_usage}%" "warning"
        alerts_triggered=true
    fi
    
    if [ "$alerts_triggered" = false ]; then
        echo "$(date): No se detectaron problemas"
    fi
}

# Ejecutar verificación
check_alerts
```

Esta documentación de ejemplos proporciona configuraciones prácticas y scripts de automatización para facilitar el despliegue y gestión de los agentes del SOC-Inteligente en diferentes entornos empresariales.