/**
 * Generador y compilador de agentes para SOC inteligente
 *
 * Este módulo permite generar agentes preconfigurados para Windows, macOS y Linux
 * que se pueden descargar directamente desde la plataforma SOC
 */
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as child_process from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
const exec = util.promisify(child_process.exec);
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const mkdir = util.promisify(fs.mkdir);
/**
 * Tipo de sistema operativo para el agente
 */
export var AgentOS;
(function (AgentOS) {
    AgentOS["WINDOWS"] = "windows";
    AgentOS["MACOS"] = "macos";
    AgentOS["LINUX"] = "linux";
})(AgentOS || (AgentOS = {}));
/**
 * Clase para construir y compilar agentes
 */
export class AgentBuilder {
    buildDir;
    outputDir;
    templatesDir;
    constructor() {
        // Directorios de trabajo
        this.buildDir = path.join(os.tmpdir(), 'soc-agent-builder');
        this.outputDir = path.join(process.cwd(), 'public', 'downloads'); // <-- fix here
        this.templatesDir = path.join(process.cwd(), 'agents');
        // Crear directorios si no existen
        this.ensureDirectories();
    }
    /**
     * Asegura que los directorios necesarios existan
     */
    async ensureDirectories() {
        try {
            if (!fs.existsSync(this.buildDir)) {
                await mkdir(this.buildDir, { recursive: true });
            }
            if (!fs.existsSync(this.outputDir)) {
                await mkdir(this.outputDir, { recursive: true });
            }
        }
        catch (error) {
            console.error('Error creating directories:', error);
        }
    }
    /**
     * Genera un agente preconfigurado para el sistema operativo especificado
     */
    async buildAgent(config) {
        try {
            // Generar ID único para este agente
            const agentId = `agent-${uuidv4().substring(0, 8)}`;
            // Crear directorio de construcción único para este agente
            const buildPath = path.join(this.buildDir, agentId);
            await mkdir(buildPath, { recursive: true });
            // Generar configuración del agente
            const agentConfig = this.generateAgentConfig(config, agentId);
            // Guardar configuración en archivo
            const configPath = path.join(buildPath, 'agent-config.json');
            await writeFile(configPath, JSON.stringify(agentConfig, null, 2), 'utf-8');
            // Generar archivo empaquetado según el SO
            const result = await this.packageAgent(config.os, buildPath, agentConfig, agentId);
            // Limpiar archivos temporales
            this.cleanupBuildDir(buildPath).catch(error => {
                console.warn('Error cleaning up build files:', error);
            });
            return {
                success: result.success,
                message: result.message,
                filePath: result.filePath,
                downloadUrl: result.downloadUrl,
                agentId
            };
        }
        catch (error) {
            console.error('Error building agent:', error);
            return {
                success: false,
                message: `Error building agent: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * Genera la configuración para el agente
     */
    generateAgentConfig(config, agentId) {
        // Configurar capacidades del agente
        const capabilities = {
            fileSystemMonitoring: config.capabilities?.fileSystemMonitoring ?? true,
            processMonitoring: config.capabilities?.processMonitoring ?? true,
            networkMonitoring: config.capabilities?.networkMonitoring ?? true,
            registryMonitoring: config.os === AgentOS.WINDOWS && (config.capabilities?.registryMonitoring ?? true),
            securityLogsMonitoring: config.capabilities?.securityLogsMonitoring ?? true,
            malwareScanning: config.capabilities?.malwareScanning ?? true,
            vulnerabilityScanning: config.capabilities?.vulnerabilityScanning ?? true
        };
        // Generar configuración base
        return {
            // Información de conexión
            serverUrl: config.serverUrl,
            registrationKey: config.registrationKey,
            agentId: agentId,
            // Identificación del agente
            configPath: this.getDefaultConfigPath(config.os),
            // Intervalos
            heartbeatInterval: 60,
            dataUploadInterval: 300,
            scanInterval: 3600,
            // Endpoints
            registrationEndpoint: '/api/agents/register',
            dataEndpoint: '/api/agents/data', // <-- Corregido aquí
            heartbeatEndpoint: '/api/agents/heartbeat',
            // Seguridad
            signMessages: false,
            // Configuración de monitoreo
            capabilities,
            // Logs
            logFilePath: this.getDefaultLogPath(config.os),
            maxStorageSize: 100,
            logLevel: 'info',
            // Nuevo: ID del conector para que el agente pueda construir el endpoint
            connectorId: config.userId ? String(config.userId) : undefined // O usar otro identificador real
        };
    }
    /**
     * Devuelve la ruta por defecto para el archivo de configuración según el SO
     */
    getDefaultConfigPath(os) {
        switch (os) {
            case AgentOS.WINDOWS:
                return 'C:\\ProgramData\\SOCIntelligent\\agent-config.json';
            case AgentOS.MACOS:
                return '/Library/Application Support/SOCIntelligent/agent-config.json';
            case AgentOS.LINUX:
                return '/etc/soc-intelligent/agent-config.json';
            default:
                return './agent-config.json';
        }
    }
    /**
     * Devuelve la ruta por defecto para el archivo de log según el SO
     */
    getDefaultLogPath(os) {
        switch (os) {
            case AgentOS.WINDOWS:
                return 'C:\\ProgramData\\SOCIntelligent\\agent.log';
            case AgentOS.MACOS:
                return '/Library/Logs/SOCIntelligent/agent.log';
            case AgentOS.LINUX:
                return '/var/log/soc-intelligent/agent.log';
            default:
                return './agent.log';
        }
    }
    /**
     * Empaqueta el agente para el sistema operativo especificado
     */
    async packageAgent(os, buildPath, config, agentId) {
        try {
            const sourceDir = path.join(buildPath, 'source');
            await mkdir(sourceDir, { recursive: true });
            // Copiar el código fuente del agente completo
            await fs.promises.cp(this.templatesDir, sourceDir, { recursive: true });
            // Guardar configuración dentro del paquete
            await writeFile(path.join(sourceDir, 'agent-config.json'), JSON.stringify(config, null, 2), 'utf-8');
            // Generar archivo YAML de configuración
            await this.generateAgentYamlConfig(sourceDir, config);
            const archiveName = `soc-agent-source-${os}-${agentId}.tar.gz`;
            const archivePath = path.join(this.outputDir, archiveName);
            await this.createTarArchive(sourceDir, archivePath);
            const downloadUrl = `/downloads/${archiveName}`;
            return {
                success: true,
                message: `Agent source package created successfully`,
                filePath: archivePath,
                downloadUrl
            };
        }
        catch (error) {
            console.error(`Error packaging agent for ${os}:`, error);
            return {
                success: false,
                message: `Error packaging agent: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * Crea archivos necesarios para el agente Windows
     */
    async createWindowsAgentFiles(buildPath, config) {
        // Crear script de instalación (PowerShell)
        const installScript = `
# Instalador del Agente SOC-Inteligente para Windows
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

$ErrorActionPreference = "Stop"

# Crear directorios necesarios
$installDir = "C:\\Program Files\\SOCIntelligent"
$dataDir = "C:\\ProgramData\\SOCIntelligent"

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# Copiar archivos
Write-Host "Instalando archivos del agente..."
Copy-Item -Path ".\\agent\\*" -Destination $installDir -Recurse -Force

# Guardar configuración
Write-Host "Configurando agente..."
$configPath = "$dataDir\\agent-config.json"
$configJson = '${JSON.stringify(config)}'
Set-Content -Path $configPath -Value $configJson

# Crear servicio Windows
Write-Host "Instalando servicio de Windows..."
$serviceName = "SOCIntelligentAgent"

# Verificar si el servicio ya existe
$serviceExists = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($serviceExists) {
    Write-Host "El servicio ya existe. Deteniéndolo para actualizar..."
    Stop-Service -Name $serviceName
    Start-Sleep -Seconds 2
}

# Detectar Node.js en el sistema
Write-Host "Detectando Node.js..."
$nodePath = $null

# Intentar encontrar node.exe en el PATH
try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $nodePath = $nodeCommand.Source
    Write-Host "Node.js encontrado en: $nodePath" -ForegroundColor Green
} catch {
    # Buscar en ubicaciones comunes de Node.js
    $commonPaths = @(
        "$env:ProgramFiles\\nodejs\\node.exe",
        "$env:ProgramFiles(x86)\\nodejs\\node.exe",
        "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\node.exe",
        "$env:APPDATA\\npm\\node.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $nodePath = $path
            Write-Host "Node.js encontrado en: $nodePath" -ForegroundColor Green
            break
        }
    }
}

if (-not $nodePath) {
    Write-Host "Error: Node.js no encontrado en el sistema." -ForegroundColor Red
    Write-Host "Por favor, instale Node.js desde https://nodejs.org antes de continuar." -ForegroundColor Yellow
    exit 1
}

# Verificar que el archivo agent-windows.js existe
$agentScript = "$installDir\\agent-windows.js"
if (-not (Test-Path $agentScript)) {
    Write-Host "Error: Archivo del agente no encontrado en $agentScript" -ForegroundColor Red
    exit 1
}

# Usar NSSM para crear/actualizar el servicio
$nssmPath = "$installDir\\nssm.exe"

if (-not (Test-Path $nssmPath)) {
    Write-Host "Error: NSSM no encontrado en $nssmPath" -ForegroundColor Red
    exit 1
}

if ($serviceExists) {
    # Actualizar servicio existente
    & $nssmPath set $serviceName Application "$nodePath"
    & $nssmPath set $serviceName AppParameters "$agentScript"
    & $nssmPath set $serviceName AppDirectory "$installDir"
    & $nssmPath set $serviceName DisplayName "SOC Intelligent Security Agent"
    & $nssmPath set $serviceName Description "Monitoriza el sistema y envía datos de seguridad a la plataforma SOC-Inteligente"
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    & $nssmPath set $serviceName ObjectName LocalSystem
    & $nssmPath set $serviceName AppStdout "$dataDir\\agent-stdout.log"
    & $nssmPath set $serviceName AppStderr "$dataDir\\agent-stderr.log"
} else {
    # Crear nuevo servicio
    & $nssmPath install $serviceName "$nodePath" "$agentScript"
    & $nssmPath set $serviceName DisplayName "SOC Intelligent Security Agent"
    & $nssmPath set $serviceName Description "Monitoriza el sistema y envía datos de seguridad a la plataforma SOC-Inteligente"
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    & $nssmPath set $serviceName ObjectName LocalSystem
    & $nssmPath set $serviceName AppStdout "$dataDir\\agent-stdout.log"
    & $nssmPath set $serviceName AppStderr "$dataDir\\agent-stderr.log"
}

# Verificar que el servicio se configuró correctamente
Write-Host "Verificando configuración del servicio..."
$serviceInfo = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $serviceInfo) {
    Write-Host "Error: El servicio no fue creado correctamente." -ForegroundColor Red
    exit 1
}

# Intentar iniciar el servicio con manejo de errores mejorado
Write-Host "Iniciando servicio SOC-Intelligent..."
try {
    Start-Service -Name $serviceName -ErrorAction Stop
    
    # Verificar que el servicio se inició correctamente
    Start-Sleep -Seconds 3
    $serviceStatus = Get-Service -Name $serviceName
    
    if ($serviceStatus.Status -eq "Running") {
        Write-Host "Instalación completada. El agente está en ejecución." -ForegroundColor Green
        Write-Host "ID del Agente: ${config.agentId}" -ForegroundColor Cyan
        Write-Host "Servidor SOC: ${config.serverUrl}" -ForegroundColor Cyan
        Write-Host "Ubicación de logs: $dataDir\\agent-stdout.log" -ForegroundColor Cyan
    } else {
        Write-Host "Advertencia: El servicio fue creado pero no se está ejecutando." -ForegroundColor Yellow
        Write-Host "Estado actual: $($serviceStatus.Status)" -ForegroundColor Yellow
        Write-Host "Verifique los logs en: $dataDir\\agent-stderr.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error al iniciar el servicio: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "El servicio fue instalado pero falló al iniciar." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "1. Verifique que Node.js esté funcionando: $nodePath --version" -ForegroundColor Yellow
    Write-Host "2. Verifique el archivo del agente: $agentScript" -ForegroundColor Yellow
    Write-Host "3. Revise los logs de error en: $dataDir\\agent-stderr.log" -ForegroundColor Yellow
    Write-Host "4. Intente iniciar el servicio manualmente: Start-Service -Name $serviceName" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Para más información, ejecute: Get-EventLog -LogName System -Source 'Service Control Manager' -Newest 5" -ForegroundColor Yellow
    exit 1
}
`;
        // Crear script de desinstalación
        const uninstallScript = `
# Desinstalador del Agente SOC-Inteligente para Windows
# ----------------------------------------------

$ErrorActionPreference = "Stop"

$serviceName = "SOCIntelligentAgent"
$installDir = "C:\\Program Files\\SOCIntelligent"
$dataDir = "C:\\ProgramData\\SOCIntelligent"
$nssmPath = "$installDir\\nssm.exe"

# Detener y eliminar servicio
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Write-Host "Deteniendo servicio..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    
    if (Test-Path $nssmPath) {
        Write-Host "Eliminando servicio..."
        & $nssmPath remove $serviceName confirm
    } else {
        Write-Host "Eliminando servicio con sc..."
        sc.exe delete $serviceName
    }
}

# Eliminar archivos
if (Test-Path $installDir) {
    Write-Host "Eliminando archivos de instalación..."
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Opcionalmente, eliminar datos y configuración
$removeData = Read-Host "¿Desea eliminar también los datos y la configuración? (S/N)"
if ($removeData -eq "S" -or $removeData -eq "s") {
    if (Test-Path $dataDir) {
        Write-Host "Eliminando datos y configuración..."
        Remove-Item -Path $dataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Desinstalación completada." -ForegroundColor Green
`;
        // Crear directorio para archivos del agente
        const agentDir = path.join(buildPath, 'agent');
        await mkdir(agentDir, { recursive: true });
        // Escribir archivos
        await writeFile(path.join(buildPath, 'install.ps1'), installScript, 'utf-8');
        await writeFile(path.join(buildPath, 'uninstall.ps1'), uninstallScript, 'utf-8');
        // Descargar NSSM (Non-Sucking Service Manager) para gestionar servicios de Windows
        await this.downloadFile('https://nssm.cc/release/nssm-2.24.zip', path.join(buildPath, 'nssm.zip'));
        // Extraer NSSM
        await exec(`unzip -j ${path.join(buildPath, 'nssm.zip')} nssm-2.24/win64/nssm.exe -d ${agentDir}`);
        // Compilar agente para Windows
        await this.compileAgent(agentDir, AgentOS.WINDOWS);
    }
    /**
     * Crea archivos necesarios para el agente macOS
     */
    async createMacOSAgentFiles(buildPath, config) {
        // Crear script de instalación (bash)
        const installScript = `#!/bin/bash
# Instalador del Agente SOC-Inteligente para macOS
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

# Crear directorios necesarios
INSTALL_DIR="/Library/SOCIntelligent"
CONFIG_DIR="/Library/Application Support/SOCIntelligent"
LOG_DIR="/Library/Logs/SOCIntelligent"

mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
chmod 755 "$INSTALL_DIR"
chmod 755 "$CONFIG_DIR" 
chmod 755 "$LOG_DIR"

# Copiar archivos
echo "Instalando archivos del agente..."
cp -Rf ./agent/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/agent-macos"

# Guardar configuración
echo "Configurando agente..."
CONFIG_PATH="$CONFIG_DIR/agent-config.json"
echo '${JSON.stringify(config)}' > "$CONFIG_PATH"
chmod 644 "$CONFIG_PATH"

# Crear archivo de LaunchDaemon
PLIST_PATH="/Library/LaunchDaemons/com.soc-intelligent.agent.plist"
cat > "$PLIST_PATH" << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.soc-intelligent.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/agent-macos</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent-error.log</string>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
</dict>
</plist>
EOL

# Establecer permisos correctos
chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

# Iniciar el servicio
echo "Iniciando agente SOC-Intelligent..."
launchctl load -w "$PLIST_PATH"

echo "Instalación completada. El agente está en ejecución."
echo "ID del Agente: ${config.agentId}"
echo "Servidor SOC: ${config.serverUrl}"
`;
        // Crear script de desinstalación
        const uninstallScript = `#!/bin/bash
# Desinstalador del Agente SOC-Inteligente para macOS
# ----------------------------------------------

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

PLIST_PATH="/Library/LaunchDaemons/com.soc-intelligent.agent.plist"
INSTALL_DIR="/Library/SOCIntelligent"
CONFIG_DIR="/Library/Application Support/SOCIntelligent"
LOG_DIR="/Library/Logs/SOCInteligente"

# Detener y eliminar servicio
if [ -f "$PLIST_PATH" ]; then
  echo "Deteniendo agente..."
  launchctl unload -w "$PLIST_PATH"
  echo "Eliminando archivo LaunchDaemon..."
  rm -f "$PLIST_PATH"
fi

# Eliminar archivos
if [ -d "$INSTALL_DIR" ]; then
  echo "Eliminando archivos de instalación..."
  rm -rf "$INSTALL_DIR"
fi

# Opcionalmente, eliminar datos y configuración
read -p "¿Desea eliminar también los datos y la configuración? (s/n): " REMOVE_DATA
if [ "$REMOVE_DATA" = "s" ] || [ "$REMOVE_DATA" = "S" ]; then
  if [ -d "$CONFIG_DIR" ]; then
    echo "Eliminando datos y configuración..."
    rm -rf "$CONFIG_DIR"
  fi
  if [ -d "$LOG_DIR" ]; then
    echo "Eliminando logs..."
    rm -rf "$LOG_DIR"
  fi
fi

echo "Desinstalación completada."
`;
        // Crear directorio para archivos del agente
        const agentDir = path.join(buildPath, 'agent');
        await mkdir(agentDir, { recursive: true });
        // Escribir archivos
        await writeFile(path.join(buildPath, 'install.sh'), installScript, 'utf-8');
        await writeFile(path.join(buildPath, 'uninstall.sh'), uninstallScript, 'utf-8');
        // Dar permisos de ejecución a los scripts
        await exec(`chmod +x ${path.join(buildPath, 'install.sh')}`);
        await exec(`chmod +x ${path.join(buildPath, 'uninstall.sh')}`);
        // Compilar agente para macOS
        await this.compileAgent(agentDir, AgentOS.MACOS);
    }
    /**
     * Crea archivos necesarios para el agente Linux
     */
    async createLinuxAgentFiles(buildPath, config) {
        // Crear script de instalación (bash)
        const installScript = `#!/bin/bash
# Instalador del Agente SOC-Inteligente para Linux
# ----------------------------------------------
# Este script instala y configura el agente de monitoreo de seguridad
# para conectarlo con la plataforma SOC-Inteligente.

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

# Crear directorios necesarios
INSTALL_DIR="/opt/soc-intelligent"
CONFIG_DIR="/etc/soc-intelligent"
LOG_DIR="/var/log/soc-intelligent"

mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
chmod 755 "$INSTALL_DIR"
chmod 750 "$CONFIG_DIR" 
chmod 755 "$LOG_DIR"

# Copiar archivos
echo "Instalando archivos del agente..."
cp -Rf ./agent/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/agent-linux"

# Guardar configuración
echo "Configurando agente..."
CONFIG_PATH="$CONFIG_DIR/agent-config.json"
echo '${JSON.stringify(config)}' > "$CONFIG_PATH"
chmod 640 "$CONFIG_PATH"

# Detectar sistema init
if [ -d /run/systemd/system ]; then
  # SystemD
  echo "Configurando servicio SystemD..."
  cat > /etc/systemd/system/soc-intelligent-agent.service << EOL
[Unit]
Description=SOC Intelligent Security Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/agent-linux
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent-error.log
SyslogIdentifier=soc-agent

[Install]
WantedBy=multi-user.target
EOL

  # Recargar SystemD y activar el servicio
  systemctl daemon-reload
  systemctl enable soc-intelligent-agent
  systemctl start soc-intelligent-agent
  echo "Servicio SystemD instalado y activado."
  
elif [ -x /sbin/initctl ]; then
  # Upstart
  echo "Configurando servicio Upstart..."
  cat > /etc/init/soc-intelligent-agent.conf << EOL
description "SOC Intelligent Security Agent"
author "SOC Intelligent"

start on (runlevel [2345] and started network)
stop on (runlevel [!2345] or stopping network)

respawn
respawn limit 10 5

setuid root
setgid root

exec $INSTALL_DIR/agent-linux >> $LOG_DIR/agent.log 2>> $LOG_DIR/agent-error.log
EOL

  # Iniciar el servicio con Upstart
  initctl reload-configuration
  initctl start soc-intelligent-agent
  echo "Servicio Upstart instalado y activado."
  
else
  # SysV Init
  echo "Configurando servicio SysV Init..."
  cat > /etc/init.d/soc-intelligent-agent << EOL
#!/bin/bash
### BEGIN INIT INFO
# Provides:          soc-intelligent-agent
# Required-Start:    \$network \$remote_fs \$syslog
# Required-Stop:     \$network \$remote_fs \$syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: SOC Intelligent Security Agent
# Description:       SOC Intelligent Security Agent for Linux
### END INIT INFO

DAEMON=$INSTALL_DIR/agent-linux
DAEMON_NAME=soc-intelligent-agent
DAEMON_USER=root
PIDFILE=/var/run/\$DAEMON_NAME.pid
LOG_FILE=$LOG_DIR/agent.log
ERROR_LOG=$LOG_DIR/agent-error.log

do_start() {
  echo "Starting \$DAEMON_NAME"
  start-stop-daemon --start --background --pidfile \$PIDFILE --make-pidfile --user \$DAEMON_USER --chuid \$DAEMON_USER --startas /bin/bash -- -c "exec \$DAEMON >> \$LOG_FILE 2>> \$ERROR_LOG"
}

do_stop() {
  echo "Stopping \$DAEMON_NAME"
  start-stop-daemon --stop --pidfile \$PIDFILE --retry 10
  rm -f \$PIDFILE
}

case "\$1" in
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  restart)
    do_stop
    do_start
    ;;
  status)
    status_of_proc -p \$PIDFILE "\$DAEMON" "\$DAEMON_NAME" && exit 0 || exit \$?
    ;;
  *)
    echo "Usage: /etc/init.d/\$DAEMON_NAME {start|stop|restart|status}"
    exit 1
    ;;
esac
exit 0
EOL

  # Dar permisos al script init
  chmod 755 /etc/init.d/soc-intelligent-agent
  
  # Activar el servicio
  if [ -x /usr/sbin/update-rc.d ]; then
    update-rc.d soc-intelligent-agent defaults
  elif [ -x /sbin/chkconfig ]; then
    chkconfig --add soc-intelligent-agent
    chkconfig soc-intelligent-agent on
  fi
  
  # Iniciar el servicio
  /etc/init.d/soc-intelligent-agent start
  echo "Servicio SysV Init instalado y activado."
fi

echo "Instalación completada. El agente está en ejecución."
echo "ID del Agente: ${config.agentId}"
echo "Servidor SOC: ${config.serverUrl}"
`;
        // Crear script de desinstalación
        const uninstallScript = `#!/bin/bash
# Desinstalador del Agente SOC-Inteligente para Linux
# ----------------------------------------------

set -e

# Comprobar permisos de superusuario
if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe ejecutarse como superusuario (sudo)."
  exit 1
fi

INSTALL_DIR="/opt/soc-intelligent"
CONFIG_DIR="/etc/soc-intelligent"
LOG_DIR="/var/log/soc-intelligent"

# Detectar sistema init y detener/eliminar el servicio
if [ -d /run/systemd/system ]; then
  # SystemD
  echo "Deteniendo y eliminando servicio SystemD..."
  systemctl stop soc-intelligent-agent
  systemctl disable soc-intelligent-agent
  rm -f /etc/systemd/system/soc-intelligent-agent.service
  systemctl daemon-reload
  
elif [ -x /sbin/initctl ]; then
  # Upstart
  echo "Deteniendo y eliminando servicio Upstart..."
  initctl stop soc-intelligent-agent
  rm -f /etc/init/soc-intelligent-agent.conf
  initctl reload-configuration
  
else
  # SysV Init
  echo "Deteniendo y eliminando servicio SysV Init..."
  /etc/init.d/soc-intelligent-agent stop
  if [ -x /usr/sbin/update-rc.d ]; then
    update-rc.d -f soc-intelligent-agent remove
  elif [ -x /sbin/chkconfig ]; then
    chkconfig --del soc-intelligent-agent
  fi
  rm -f /etc/init.d/soc-intelligent-agent
fi

# Eliminar archivos
if [ -d "$INSTALL_DIR" ]; then
  echo "Eliminando archivos de instalación..."
  rm -rf "$INSTALL_DIR"
fi

# Opcionalmente, eliminar datos y configuración
read -p "¿Desea eliminar también los datos y la configuración? (s/n): " REMOVE_DATA
if [ "$REMOVE_DATA" = "s" ] || [ "$REMOVE_DATA" = "S" ]; then
  if [ -d "$CONFIG_DIR" ]; then
    echo "Eliminando datos y configuración..."
    rm -rf "$CONFIG_DIR"
  fi
  if [ -d "$LOG_DIR" ]; then
    echo "Eliminando logs..."
    rm -rf "$LOG_DIR"
  fi
fi

echo "Desinstalación completada."
`;
        // Crear directorio para archivos del agente
        const agentDir = path.join(buildPath, 'agent');
        await mkdir(agentDir, { recursive: true });
        // Escribir archivos
        await writeFile(path.join(buildPath, 'install.sh'), installScript, 'utf-8');
        await writeFile(path.join(buildPath, 'uninstall.sh'), uninstallScript, 'utf-8');
        // Dar permisos de ejecución a los scripts
        await exec(`chmod +x ${path.join(buildPath, 'install.sh')}`);
        await exec(`chmod +x ${path.join(buildPath, 'uninstall.sh')}`);
        // Compilar agente para Linux
        await this.compileAgent(agentDir, AgentOS.LINUX);
    }
    /**
     * Compila el agente para la plataforma especificada
     */
    async compileAgent(outputDir, os) {
        try {
            // Nombre del archivo principal según SO
            const mainFile = this.getAgentMainFile(os);
            // Copiar código fuente necesario
            await exec(`cp -r ${path.join(this.templatesDir, 'common')} ${outputDir}/`);
            await exec(`cp -r ${path.join(this.templatesDir, os.toString())} ${outputDir}/`);
            // Crear archivo de punto de entrada
            const agentEntryPoint = `
import path from 'path';
const mainModulePath = path.join(__dirname, '${os.toString()}', '${mainFile}');
import { ${this.getAgentClassName(os)} as AgentClass } from mainModulePath;
const { AgentConfig, loadConfig } = require('./common/agent-config');

// Para ser autosuficiente, exportamos las clases necesarias
exports.${this.getAgentClassName(os)} = AgentClass;
exports.AgentConfig = AgentConfig;
exports.loadConfig = loadConfig;
`;
            await writeFile(path.join(outputDir, 'agent-core.js'), agentEntryPoint, 'utf-8');
            // Crear ejecutable según SO
            switch (os) {
                case AgentOS.WINDOWS:
                    // Para Windows, basta con el archivo .js
                    break;
                case AgentOS.MACOS:
                case AgentOS.LINUX:
                    // Para macOS y Linux, crear un pequeño script ejecutable
                    const unixScript = `#!/usr/bin/env node
require('./agent-core');

const { ${this.getAgentClassName(os)} } = require('./agent-core');
const configPath = '${this.getDefaultConfigPath(os)}';

// Iniciar el agente
const agent = new ${this.getAgentClassName(os)}(configPath);

async function main() {
  try {
    const initialized = await agent.initialize();
    if (!initialized) {
      console.error('Failed to initialize agent, exiting');
      process.exit(1);
    }
    
    const started = await agent.start();
    if (!started) {
      console.error('Failed to start agent, exiting');
      process.exit(1);
    }
    
    console.log('Agent started successfully');
    
    // Manejar señales para cierre limpio
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down...');
      await agent.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down...');
      await agent.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Unhandled error in agent:', error);
    process.exit(1);
  }
}

// Iniciar agente
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
`;
                    const executableName = os === AgentOS.MACOS ? 'agent-macos' : 'agent-linux';
                    await writeFile(path.join(outputDir, executableName), unixScript, 'utf-8');
                    await exec(`chmod +x ${path.join(outputDir, executableName)}`);
                    break;
            }
        }
        catch (error) {
            console.error(`Error compiling agent for ${os}:`, error);
            throw error;
        }
    }
    /**
     * Obtiene el nombre del archivo principal del agente según el SO
     */
    getAgentMainFile(os) {
        switch (os) {
            case AgentOS.WINDOWS:
                return 'windows-agent.ts';
            case AgentOS.MACOS:
                return 'macos-agent.ts';
            case AgentOS.LINUX:
                return 'linux-agent.ts';
            default:
                throw new Error(`Unsupported OS: ${os}`);
        }
    }
    /**
     * Obtiene el nombre de la clase del agente según el SO
     */
    getAgentClassName(os) {
        switch (os) {
            case AgentOS.WINDOWS:
                return 'WindowsAgent';
            case AgentOS.MACOS:
                return 'MacOSAgent';
            case AgentOS.LINUX:
                return 'LinuxAgent';
            default:
                throw new Error(`Unsupported OS: ${os}`);
        }
    }
    /**
     * Descarga un archivo desde una URL
     */
    async downloadFile(url, dest) {
        await exec(`curl -L -o "${dest}" "${url}"`);
    }
    /**
     * Crea un archivo ZIP con el contenido del directorio
     */
    async createZipArchive(sourceDir, outputPath) {
        // Cambiar al directorio y empaquetar todo
        await exec(`cd "${sourceDir}" && zip -r "${outputPath}" .`);
    }
    /**
     * Crea un archivo tarball (tar.gz) con el contenido del directorio
     */
    async createTarArchive(sourceDir, outputPath) {
        // Empaquetar todos los archivos, incluidos ocultos, usando find
        await exec(`cd "${sourceDir}" && tar -czf "${outputPath}" $(find . -mindepth 1 -maxdepth 1 -print)`);
        // Verificar que el archivo se creó y no está vacío
        const stat = await util.promisify(fs.stat)(outputPath).catch(() => null);
        if (!stat || stat.size === 0) {
            throw new Error(`Error creando el archivo tar.gz: el archivo resultante está vacío o no existe (${outputPath})`);
        }
    }
    /**
     * Genera el archivo agent.yaml con la configuración del agente
     */
    async generateAgentYamlConfig(packageDir, config) {
        try {
            // Convertir la configuración a YAML
            const yamlContent = yaml.dump(config, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
                sortKeys: false
            });
            // Escribir el archivo YAML
            const yamlPath = path.join(packageDir, 'agent.yaml');
            await writeFile(yamlPath, yamlContent, 'utf-8');
            console.log('agent.yaml configuration file generated successfully');
        }
        catch (error) {
            console.error('Error generating agent.yaml:', error);
            // No fallar el proceso completo si solo falla la generación de YAML
            // El archivo JSON seguirá disponible
        }
    }
    /**
     * Limpia los archivos temporales de construcción
     */
    async cleanupBuildDir(buildPath) {
        // await exec(`rm -rf "${buildPath}"`);
        console.log(`Build files in ${buildPath} preserved for debugging. Remember to clean up manually.`);
    }
}
