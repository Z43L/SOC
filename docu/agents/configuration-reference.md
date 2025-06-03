# Configuración de Agentes - Referencia Completa

## Introducción

Esta guía proporciona una referencia completa de todas las opciones de configuración disponibles para los agentes SOC.

## Estructura de Configuración

La configuración del agente se almacena en formato YAML y puede ser modificada mediante:
- Archivo de configuración (`agent-config.yaml`)
- Variables de entorno
- Comandos remotos desde el servidor

## Archivo de Configuración Principal

### Estructura Básica

```yaml
# agent-config.yaml
# Configuración completa del agente SOC

# === CONEXIÓN AL SERVIDOR ===
serverUrl: "https://soc.miempresa.com"
organizationKey: "org_1234567890abcdef"
agentId: "agent_uuid_generado_automaticamente"

# === INTERVALOS DE OPERACIÓN ===
heartbeatInterval: 60          # Segundos entre heartbeats
dataUploadInterval: 300        # Segundos entre envíos de datos
scanInterval: 3600             # Segundos entre escaneos completos

# === ENDPOINTS DEL SERVIDOR ===
registrationEndpoint: "/api/agents/register"
dataEndpoint: "/api/agents/data"
heartbeatEndpoint: "/api/agents/heartbeat"
commandEndpoint: "/api/agents/commands"
updateEndpoint: "/api/agents/updates"

# === SEGURIDAD ===
signMessages: true
privateKeyPath: "/etc/soc-agent/private.key"
serverPublicKeyPath: "/etc/soc-agent/server.pub"
validateCertificates: true
maxMessageSize: 1048576        # 1MB máximo por mensaje
allowInsecureConnections: false
expectedBinaryHash: "sha256:abcdef123456..."

# === CAPACIDADES DEL AGENTE ===
capabilities:
  fileSystemMonitoring: true
  processMonitoring: true
  networkMonitoring: true
  registryMonitoring: true     # Solo Windows
  securityLogsMonitoring: true
  malwareScanning: false
  vulnerabilityScanning: false
  commandExecution: false

# === CONFIGURACIÓN DE LOGS ===
logLevel: "info"               # debug, info, warn, error
logFilePath: "/var/log/soc-agent/agent.log"
maxLogSize: 52428800          # 50MB
maxLogAge: 30                 # días
logRotationCount: 5

# === ALMACENAMIENTO ===
maxStorageSize: 500           # MB
queueSize: 1000               # Número máximo de eventos en cola
queuePersistPath: "/var/lib/soc-agent/queue"

# === TRANSPORTE ===
transport: "https"            # https o websocket
compressionEnabled: true
connectionTimeout: 30000      # ms
readTimeout: 60000           # ms
retryAttempts: 5
retryInterval: 5000          # ms

# === COMANDOS REMOTOS ===
enableCommands: false
allowedCommands:
  - "collect_now"
  - "update_config"
  - "get_status"
commandTimeout: 60000        # ms
commandTempDir: "/tmp/soc-agent"

# === COLECTORES HABILITADOS ===
enabledCollectors:
  - "process"
  - "filesystem"
  - "network"
  - "auth"
  
# === CONFIGURACIÓN ESPECÍFICA DE COLECTORES ===
collectorSettings:
  process:
    scanInterval: 30         # segundos
    suspiciousProcesses:
      - "cmd.exe"
      - "powershell.exe"
    cpuThreshold: 80         # porcentaje
    memoryThreshold: 500     # MB
    
  filesystem:
    watchPaths:
      - "/etc"
      - "/bin"
      - "/sbin"
      - "/usr/bin"
      - "/home"
    excludePaths:
      - "/proc"
      - "/sys"
      - "/dev"
    eventTypes:
      - "create"
      - "modify"
      - "delete"
      - "rename"
      
  network:
    monitorPorts: true
    suspiciousPorts:
      - 4444
      - 5555
      - 6666
    geoLocationEnabled: true
    
  auth:
    failedLoginThreshold: 5
    monitorSudo: true
    monitorSsh: true

# === ALERTAS Y UMBRALES ===
alertThresholds:
  cpu: 90                    # porcentaje
  memory: 90                 # porcentaje
  disk: 95                   # porcentaje
  suspiciousProcessCount: 10
  failedLoginsPerHour: 20
  networkConnectionsPerMinute: 100

# === AUTO-ACTUALIZACIÓN ===
autoUpdate:
  enabled: false
  checkInterval: 21600       # 6 horas en segundos
  maintenanceWindow:
    start: "02:00"
    end: "04:00"
    timezone: "UTC"
  autoApply:
    critical: true
    security: true
    features: false
    bugfixes: true
  rollbackTimeout: 300       # segundos

# === CONFIGURACIÓN AVANZADA ===
advanced:
  memoryLimit: 512           # MB - límite de memoria del agente
  cpuLimit: 25              # porcentaje - límite de CPU del agente
  bufferSize: 8192          # bytes - tamaño de buffer de red
  compressionLevel: 6       # 1-9 nivel de compresión
  keepAliveInterval: 30     # segundos
```

## Variables de Entorno

### Variables de Conexión

```bash
# Configuración del servidor
export AGENT_SERVER_URL="https://soc.miempresa.com"
export AGENT_ORG_KEY="org_1234567890abcdef"
export AGENT_ID="agent_custom_id"

# Autenticación
export AGENT_PRIVATE_KEY_PATH="/etc/soc-agent/private.key"
export AGENT_SERVER_PUBLIC_KEY_PATH="/etc/soc-agent/server.pub"
```

### Variables de Logging

```bash
# Configuración de logs
export AGENT_LOG_LEVEL="debug"
export AGENT_LOG_FILE="/var/log/soc-agent/agent.log"
export AGENT_MAX_LOG_SIZE="52428800"
export AGENT_LOG_ROTATION_COUNT="5"
```

### Variables de Operación

```bash
# Intervalos
export AGENT_HEARTBEAT_INTERVAL="60"
export AGENT_DATA_UPLOAD_INTERVAL="300"
export AGENT_SCAN_INTERVAL="3600"

# Capacidades
export AGENT_ENABLE_FILE_MONITORING="true"
export AGENT_ENABLE_PROCESS_MONITORING="true"
export AGENT_ENABLE_NETWORK_MONITORING="true"
export AGENT_ENABLE_COMMANDS="false"
```

### Variables de Seguridad

```bash
# Seguridad
export AGENT_VALIDATE_CERTIFICATES="true"
export AGENT_SIGN_MESSAGES="true"
export AGENT_MAX_MESSAGE_SIZE="1048576"
export AGENT_ALLOW_INSECURE="false"
```

## Configuraciones por Plataforma

### Windows

#### Configuración Específica

```yaml
# Configuración adicional para Windows
platform:
  windows:
    serviceName: "SOCAgent"
    serviceDisplayName: "SOC Intelligence Agent"
    serviceDescription: "Agente de recolección de datos de seguridad"
    installPath: "C:\\Program Files\\SOC Agent"
    dataPath: "C:\\ProgramData\\SOC Agent"
    
    # Configuración de Event Log
    eventLog:
      sources:
        - "Security"
        - "System"
        - "Application"
        - "PowerShell/Operational"
      filters:
        - eventId: [4624, 4625, 4648, 4672]  # Logon events
        - eventId: [4697, 7034, 7035, 7036]  # Service events
        - eventId: [4688, 4689]              # Process events
        
    # Configuración de Registry
    registry:
      monitorKeys:
        - "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
        - "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
        - "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
        - "HKLM\\SYSTEM\\CurrentControlSet\\Services"
      excludeKeys:
        - "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
        
    # Configuración WMI
    wmi:
      enabled: true
      namespaces:
        - "root\\cimv2"
        - "root\\SecurityCenter2"
      queries:
        processes: "SELECT * FROM Win32_Process"
        services: "SELECT * FROM Win32_Service"
        
    # Permisos requeridos
    permissions:
      - "SeServiceLogonRight"
      - "SeDebugPrivilege"
      - "SeSecurityPrivilege"
```

#### Variables de Entorno Windows

```cmd
REM Configuración específica Windows
set AGENT_SERVICE_NAME=SOCAgent
set AGENT_INSTALL_PATH=C:\Program Files\SOC Agent
set AGENT_DATA_PATH=C:\ProgramData\SOC Agent
set AGENT_ENABLE_WMI=true
set AGENT_ENABLE_EVENTLOG=true
set AGENT_ENABLE_REGISTRY=true
```

### Linux

#### Configuración Específica

```yaml
# Configuración adicional para Linux
platform:
  linux:
    serviceName: "soc-agent"
    serviceType: "systemd"         # systemd, sysv, upstart
    installPath: "/usr/local/bin"
    dataPath: "/var/lib/soc-agent"
    pidFile: "/var/run/soc-agent.pid"
    
    # Configuración de systemd
    systemd:
      unitFile: "/etc/systemd/system/soc-agent.service"
      user: "soc-agent"
      group: "soc-agent"
      restart: "always"
      restartSec: 10
      
    # Configuración de journald
    journald:
      enabled: true
      units:
        - "sshd"
        - "sudo"
        - "cron"
        - "systemd"
      priorities:
        - "err"
        - "warning"
        - "notice"
        
    # Configuración de inotify
    inotify:
      maxWatches: 8192
      maxInstances: 128
      excludePatterns:
        - "*.tmp"
        - "*.swp"
        - "*~"
        
    # Configuración de procfs
    procfs:
      enabled: true
      scanInterval: 30
      monitorPaths:
        - "/proc/*/stat"
        - "/proc/*/status"
        - "/proc/*/cmdline"
```

#### Variables de Entorno Linux

```bash
# Configuración específica Linux
export AGENT_SERVICE_NAME="soc-agent"
export AGENT_INSTALL_PATH="/usr/local/bin"
export AGENT_DATA_PATH="/var/lib/soc-agent"
export AGENT_PID_FILE="/var/run/soc-agent.pid"
export AGENT_ENABLE_JOURNALD="true"
export AGENT_ENABLE_INOTIFY="true"
```

### macOS

#### Configuración Específica

```yaml
# Configuración adicional para macOS
platform:
  macos:
    serviceName: "com.company.soc-agent"
    launchdType: "daemon"          # daemon, agent
    installPath: "/usr/local/bin"
    dataPath: "/var/lib/soc-agent"
    
    # Configuración de launchd
    launchd:
      plistPath: "/Library/LaunchDaemons/com.company.soc-agent.plist"
      runAtLoad: true
      keepAlive: true
      standardErrorPath: "/var/log/soc-agent/error.log"
      standardOutPath: "/var/log/soc-agent/output.log"
      
    # Configuración de Endpoint Security
    endpointSecurity:
      enabled: false             # Requiere entitlements especiales
      events:
        - "file"
        - "process"
        - "network"
        
    # Configuración de Console.app
    console:
      enabled: true
      categories:
        - "com.apple.securityd"
        - "com.apple.authd"
        - "com.apple.sudo"
```

## Perfiles de Configuración

### Perfil de Desarrollo

```yaml
# Configuración para desarrollo y testing
development:
  serverUrl: "https://dev-soc.miempresa.com"
  logLevel: "debug"
  heartbeatInterval: 30
  dataUploadInterval: 60
  validateCertificates: false
  allowInsecureConnections: true
  
  enabledCollectors:
    - "process"
    - "filesystem"
    
  collectorSettings:
    process:
      scanInterval: 10
    filesystem:
      watchPaths:
        - "/tmp/test"
```

### Perfil de Producción

```yaml
# Configuración para producción
production:
  serverUrl: "https://soc.miempresa.com"
  logLevel: "info"
  heartbeatInterval: 60
  dataUploadInterval: 300
  validateCertificates: true
  allowInsecureConnections: false
  signMessages: true
  
  enabledCollectors:
    - "process"
    - "filesystem"
    - "network"
    - "auth"
    
  autoUpdate:
    enabled: true
    autoApply:
      critical: true
      security: true
      features: false
```

### Perfil de Alto Rendimiento

```yaml
# Configuración para sistemas de alto rendimiento
highPerformance:
  dataUploadInterval: 600      # Menos frecuencia de envío
  queueSize: 2000             # Mayor buffer
  compressionEnabled: true     # Comprimir datos
  
  collectorSettings:
    process:
      scanInterval: 60         # Menos frecuencia de escaneo
    filesystem:
      excludePaths:            # Excluir más directorios
        - "/var/cache"
        - "/var/tmp"
        - "/tmp"
        
  advanced:
    memoryLimit: 256          # Límite de memoria más estricto
    cpuLimit: 15             # Límite de CPU más estricto
```

## Configuración Dinámica

### Actualización via Comandos Remotos

```typescript
// Comando de actualización de configuración
interface ConfigUpdateCommand {
  type: "update_config";
  parameters: {
    config: {
      dataUploadInterval: number;
      enabledCollectors: string[];
      logLevel: string;
    };
    applyImmediately: boolean;
    restartRequired: boolean;
  };
}

// Ejemplo de comando
{
  "type": "update_config",
  "parameters": {
    "config": {
      "dataUploadInterval": 600,
      "enabledCollectors": ["process", "network"],
      "logLevel": "warn"
    },
    "applyImmediately": true,
    "restartRequired": false
  }
}
```

### API de Configuración

```typescript
// API interna para modificar configuración
class AgentConfig {
  // Actualizar configuración específica
  async updateSetting(key: string, value: any): Promise<boolean>
  
  // Actualizar múltiples configuraciones
  async updateSettings(updates: Record<string, any>): Promise<boolean>
  
  // Recargar configuración desde archivo
  async reload(): Promise<boolean>
  
  // Validar configuración
  async validate(config: Partial<AgentConfig>): Promise<ValidationResult>
  
  // Obtener configuración actual
  getCurrentConfig(): AgentConfig
  
  // Obtener valores por defecto
  getDefaultConfig(): AgentConfig
}
```

## Validación de Configuración

### Reglas de Validación

```typescript
interface ConfigValidationRules {
  serverUrl: {
    required: true;
    pattern: /^https?:\/\/.+/;
    message: "serverUrl debe ser una URL válida HTTPS";
  };
  
  organizationKey: {
    required: true;
    minLength: 16;
    pattern: /^[a-zA-Z0-9_-]+$/;
    message: "organizationKey debe tener al menos 16 caracteres alfanuméricos";
  };
  
  heartbeatInterval: {
    type: "number";
    min: 10;
    max: 3600;
    message: "heartbeatInterval debe estar entre 10 y 3600 segundos";
  };
  
  dataUploadInterval: {
    type: "number";
    min: 60;
    max: 86400;
    message: "dataUploadInterval debe estar entre 60 y 86400 segundos";
  };
  
  enabledCollectors: {
    type: "array";
    items: {
      type: "string";
      enum: ["process", "filesystem", "network", "auth", "registry"];
    };
    message: "enabledCollectors debe contener nombres de colectores válidos";
  };
}
```

### Función de Validación

```typescript
async function validateConfig(config: Partial<AgentConfig>): Promise<ValidationResult> {
  const errors: string[] = [];
  
  // Validar URL del servidor
  if (!config.serverUrl || !isValidUrl(config.serverUrl)) {
    errors.push("serverUrl es requerida y debe ser una URL válida");
  }
  
  // Validar clave de organización
  if (!config.organizationKey || config.organizationKey.length < 16) {
    errors.push("organizationKey es requerida y debe tener al menos 16 caracteres");
  }
  
  // Validar intervalos
  if (config.heartbeatInterval && (config.heartbeatInterval < 10 || config.heartbeatInterval > 3600)) {
    errors.push("heartbeatInterval debe estar entre 10 y 3600 segundos");
  }
  
  // Validar colectores
  if (config.enabledCollectors) {
    const validCollectors = ["process", "filesystem", "network", "auth", "registry"];
    const invalidCollectors = config.enabledCollectors.filter(c => !validCollectors.includes(c));
    if (invalidCollectors.length > 0) {
      errors.push(`Colectores inválidos: ${invalidCollectors.join(", ")}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
```

## Configuración de Seguridad Avanzada

### Encriptación de Configuración

```yaml
# Configuración con valores encriptados
security:
  encryptedFields:
    organizationKey: "encrypted:AES256:abcdef123456..."
    privateKeyPassphrase: "encrypted:AES256:fedcba654321..."
    
  encryptionKey: "${AGENT_ENCRYPTION_KEY}"  # Variable de entorno
  
  # Configuración de rotación de claves
  keyRotation:
    enabled: true
    interval: 2592000    # 30 días
    algorithm: "AES-256-GCM"
```

### Configuración de Auditoría

```yaml
# Auditoría de cambios de configuración
audit:
  enabled: true
  logPath: "/var/log/soc-agent/config-audit.log"
  
  # Eventos a auditar
  events:
    - "config_load"
    - "config_update"
    - "config_validation_failed"
    - "config_encryption_key_change"
    
  # Formato de logs de auditoría
  format: "json"
  
  # Retención de logs de auditoría
  retention:
    maxSize: "100MB"
    maxAge: "90d"
    rotationCount: 10
```

## Troubleshooting de Configuración

### Problemas Comunes

#### 1. Configuración Inválida

```bash
# Error: Invalid configuration
# Causa: Formato YAML incorrecto o valores inválidos
# Solución: Validar configuración

# Validar archivo YAML
./soc-agent --validate-config /path/to/config.yaml

# Ver errores detallados
./soc-agent --config /path/to/config.yaml --log-level debug
```

#### 2. Permisos de Archivos

```bash
# Error: Permission denied reading config file
# Causa: Permisos insuficientes
# Solución: Ajustar permisos

chmod 600 /etc/soc-agent/agent-config.yaml
chown soc-agent:soc-agent /etc/soc-agent/agent-config.yaml
```

#### 3. Variables de Entorno No Aplicadas

```bash
# Error: Environment variables not taking effect
# Causa: Variables no exportadas o nombres incorrectos
# Solución: Verificar variables

env | grep AGENT_
./soc-agent --show-config  # Mostrar configuración efectiva
```

### Herramientas de Diagnóstico

```bash
# Mostrar configuración actual
./soc-agent --show-config

# Validar configuración
./soc-agent --validate-config

# Mostrar configuración por defecto
./soc-agent --show-default-config

# Test de conectividad
./soc-agent --test-connection

# Verificar permisos
./soc-agent --check-permissions
```

Esta referencia proporciona una guía completa para configurar agentes SOC en cualquier entorno y plataforma.