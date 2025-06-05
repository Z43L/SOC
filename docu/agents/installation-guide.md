# Guía de Instalación y Despliegue de Agentes

## Introducción

Esta guía proporciona instrucciones detalladas para instalar y configurar los agentes del SOC-Inteligente en diferentes plataformas (Windows, Linux, macOS).

## Índice

- [Requisitos del Sistema](#requisitos-del-sistema)
- [Instalación en Windows](#instalación-en-windows)
- [Instalación en Linux](#instalación-en-linux)
- [Instalación en macOS](#instalación-en-macos)
- [Configuración Inicial](#configuración-inicial)
- [Configuración como Servicio](#configuración-como-servicio)
- [Verificación de la Instalación](#verificación-de-la-instalación)
- [Desinstalación](#desinstalación)

---

## Requisitos del Sistema

### Requisitos Mínimos

**Windows:**
- Windows 10 / Windows Server 2016 o superior
- 2 GB RAM disponible
- 500 MB espacio en disco
- PowerShell 5.1 o superior
- Conexión a Internet

**Linux:**
- Distribución compatible: Ubuntu 18.04+, CentOS 7+, RHEL 7+, Debian 9+
- 1 GB RAM disponible
- 300 MB espacio en disco
- glibc 2.17 o superior
- Permisos de root para instalación
- Conexión a Internet

**macOS:**
- macOS 10.15 (Catalina) o superior
- 1 GB RAM disponible
- 300 MB espacio en disco
- Permisos de administrador
- Conexión a Internet

### Requisitos de Red

- Acceso HTTPS (puerto 443) al servidor SOC
- Resolución DNS funcional
- Opcionalmente: Proxy corporativo configurado

---

## Instalación en Windows

### Método 1: Instalador MSI (Recomendado)

1. **Descargar el instalador:**
   ```powershell
   # Desde PowerShell como administrador
   Invoke-WebRequest -Uri "https://releases.soc-inteligente.com/agent/windows/latest/soc-agent-installer.msi" -OutFile "C:\Temp\soc-agent-installer.msi"
   ```

2. **Ejecutar instalador:**
   ```powershell
   # Instalación silenciosa
   msiexec /i "C:\Temp\soc-agent-installer.msi" /quiet /l*v "C:\Temp\install.log"
   
   # Instalación interactiva
   msiexec /i "C:\Temp\soc-agent-installer.msi"
   ```

3. **Verificar instalación:**
   ```powershell
   Get-Service -Name "SOC-Agent"
   Get-Process -Name "soc-agent" -ErrorAction SilentlyContinue
   ```

### Método 2: Instalación Manual

1. **Descargar binario:**
   ```powershell
   # Crear directorio de instalación
   New-Item -ItemType Directory -Force -Path "C:\Program Files\SOC-Agent"
   
   # Descargar agente
   Invoke-WebRequest -Uri "https://releases.soc-inteligente.com/agent/windows/latest/soc-agent.exe" -OutFile "C:\Program Files\SOC-Agent\soc-agent.exe"
   ```

2. **Crear archivo de configuración:**
   ```powershell
   $config = @"
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "registrationKey": "tu-clave-de-registro",
     "heartbeatInterval": 60,
     "dataUploadInterval": 300,
     "logLevel": "info",
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": true,
       "registryMonitoring": true,
       "securityLogsMonitoring": true
     }
   }
"@
   
   $config | Out-File -FilePath "C:\Program Files\SOC-Agent\agent-config.json" -Encoding UTF8
   ```

3. **Instalar como servicio:**
   ```powershell
   # Registrar servicio
   New-Service -Name "SOC-Agent" -BinaryPathName "C:\Program Files\SOC-Agent\soc-agent.exe --service" -Description "SOC-Inteligente Security Agent" -StartupType Automatic
   
   # Iniciar servicio
   Start-Service -Name "SOC-Agent"
   ```

### Configuración de Firewall

```powershell
# Permitir tráfico saliente del agente
New-NetFirewallRule -DisplayName "SOC-Agent Outbound" -Direction Outbound -Program "C:\Program Files\SOC-Agent\soc-agent.exe" -Action Allow -Protocol TCP -RemotePort 443

# Verificar regla
Get-NetFirewallRule -DisplayName "SOC-Agent Outbound"
```

---

## Instalación en Linux

### Método 1: Paquete DEB (Ubuntu/Debian)

1. **Descargar e instalar:**
   ```bash
   # Descargar paquete
   wget https://releases.soc-inteligente.com/agent/linux/latest/soc-agent_amd64.deb
   
   # Instalar paquete
   sudo dpkg -i soc-agent_amd64.deb
   
   # Resolver dependencias si es necesario
   sudo apt-get install -f
   ```

2. **Verificar instalación:**
   ```bash
   systemctl status soc-agent
   ps aux | grep soc-agent
   ```

### Método 2: Paquete RPM (CentOS/RHEL/Fedora)

1. **Descargar e instalar:**
   ```bash
   # Descargar paquete
   wget https://releases.soc-inteligente.com/agent/linux/latest/soc-agent.x86_64.rpm
   
   # Instalar paquete
   sudo rpm -ivh soc-agent.x86_64.rpm
   
   # O usar yum/dnf
   sudo yum install -y ./soc-agent.x86_64.rpm
   ```

### Método 3: Instalación Manual

1. **Descargar binario:**
   ```bash
   # Crear usuario del sistema
   sudo useradd -r -s /bin/false -d /opt/soc-agent soc-agent
   
   # Crear directorios
   sudo mkdir -p /opt/soc-agent/{bin,config,logs}
   sudo mkdir -p /var/lib/soc-agent
   
   # Descargar agente
   sudo wget -O /opt/soc-agent/bin/soc-agent https://releases.soc-inteligente.com/agent/linux/latest/soc-agent
   sudo chmod +x /opt/soc-agent/bin/soc-agent
   ```

2. **Crear configuración:**
   ```bash
   sudo tee /opt/soc-agent/config/agent-config.json > /dev/null << 'EOF'
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "registrationKey": "tu-clave-de-registro",
     "heartbeatInterval": 60,
     "dataUploadInterval": 300,
     "logLevel": "info",
     "logFilePath": "/opt/soc-agent/logs/agent.log",
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": true,
       "securityLogsMonitoring": true
     },
     "directoriesToScan": [
       "/tmp",
       "/var/tmp",
       "/dev/shm",
       "/home"
     ]
   }
   EOF
   ```

3. **Crear servicio systemd:**
   ```bash
   sudo tee /etc/systemd/system/soc-agent.service > /dev/null << 'EOF'
   [Unit]
   Description=SOC-Inteligente Security Agent
   After=network-online.target
   Wants=network-online.target
   
   [Service]
   Type=simple
   User=soc-agent
   Group=soc-agent
   ExecStart=/opt/soc-agent/bin/soc-agent --config /opt/soc-agent/config/agent-config.json
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=soc-agent
   
   # Seguridad
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   ReadWritePaths=/opt/soc-agent/logs /var/lib/soc-agent
   
   [Install]
   WantedBy=multi-user.target
   EOF
   ```

4. **Activar e iniciar servicio:**
   ```bash
   # Establecer permisos
   sudo chown -R soc-agent:soc-agent /opt/soc-agent /var/lib/soc-agent
   
   # Habilitar e iniciar servicio
   sudo systemctl daemon-reload
   sudo systemctl enable soc-agent
   sudo systemctl start soc-agent
   ```

---

## Instalación en macOS

### Método 1: Instalador PKG

1. **Descargar e instalar:**
   ```bash
   # Descargar instalador
   curl -L -o /tmp/soc-agent-installer.pkg https://releases.soc-inteligente.com/agent/macos/latest/soc-agent-installer.pkg
   
   # Instalar (requiere contraseña de administrador)
   sudo installer -pkg /tmp/soc-agent-installer.pkg -target /
   ```

### Método 2: Instalación Manual

1. **Preparar directorios:**
   ```bash
   # Crear directorios
   sudo mkdir -p /usr/local/soc-agent/{bin,config,logs}
   sudo mkdir -p /usr/local/var/soc-agent
   
   # Crear usuario del sistema (opcional para mayor seguridad)
   sudo dscl . -create /Users/_soc-agent
   sudo dscl . -create /Users/_soc-agent UserShell /usr/bin/false
   sudo dscl . -create /Users/_soc-agent RealName "SOC Agent"
   sudo dscl . -create /Users/_soc-agent UniqueID 300
   sudo dscl . -create /Users/_soc-agent PrimaryGroupID 300
   sudo dscl . -create /Users/_soc-agent NFSHomeDirectory /usr/local/var/soc-agent
   ```

2. **Descargar agente:**
   ```bash
   # Descargar y instalar binario
   sudo curl -L -o /usr/local/soc-agent/bin/soc-agent https://releases.soc-inteligente.com/agent/macos/latest/soc-agent
   sudo chmod +x /usr/local/soc-agent/bin/soc-agent
   ```

3. **Crear configuración:**
   ```bash
   sudo tee /usr/local/soc-agent/config/agent-config.json > /dev/null << 'EOF'
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "registrationKey": "tu-clave-de-registro",
     "heartbeatInterval": 60,
     "dataUploadInterval": 300,
     "logLevel": "info",
     "logFilePath": "/usr/local/soc-agent/logs/agent.log",
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": true,
       "securityLogsMonitoring": true
     }
   }
   EOF
   ```

4. **Crear LaunchDaemon:**
   ```bash
   sudo tee /Library/LaunchDaemons/com.soc-inteligente.agent.plist > /dev/null << 'EOF'
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key>
     <string>com.soc-inteligente.agent</string>
     <key>ProgramArguments</key>
     <array>
       <string>/usr/local/soc-agent/bin/soc-agent</string>
       <string>--config</string>
       <string>/usr/local/soc-agent/config/agent-config.json</string>
     </array>
     <key>RunAtLoad</key>
     <true/>
     <key>KeepAlive</key>
     <true/>
     <key>StandardErrorPath</key>
     <string>/usr/local/soc-agent/logs/error.log</string>
     <key>StandardOutPath</key>
     <string>/usr/local/soc-agent/logs/output.log</string>
   </dict>
   </plist>
   EOF
   ```

5. **Cargar e iniciar servicio:**
   ```bash
   # Establecer permisos
   sudo chown -R _soc-agent:wheel /usr/local/soc-agent /usr/local/var/soc-agent
   
   # Cargar servicio
   sudo launchctl load /Library/LaunchDaemons/com.soc-inteligente.agent.plist
   
   # Verificar estado
   sudo launchctl list | grep soc-inteligente
   ```

---

## Configuración Inicial

### Obtener Clave de Registro

1. **Desde la interfaz web del SOC:**
   - Iniciar sesión en el panel administrativo
   - Navegar a "Agentes" → "Registrar Nuevo Agente"
   - Copiar la clave de registro generada

2. **Configurar la clave en el agente:**
   ```bash
   # Linux/macOS
   sudo nano /opt/soc-agent/config/agent-config.json
   
   # Windows
   notepad "C:\Program Files\SOC-Agent\agent-config.json"
   ```

### Configuración de Red Corporativa

Si tu organización usa proxy corporativo:

```json
{
  "serverUrl": "https://tu-servidor-soc.com",
  "registrationKey": "tu-clave-de-registro",
  "proxy": {
    "enabled": true,
    "host": "proxy.empresa.com",
    "port": 8080,
    "username": "usuario_proxy",
    "password": "contraseña_proxy"
  }
}
```

### Configuración de Certificados SSL

Para entornos con certificados corporativos:

```json
{
  "serverUrl": "https://tu-servidor-soc.com",
  "registrationKey": "tu-clave-de-registro",
  "ssl": {
    "verifyPeer": true,
    "caCertPath": "/path/to/ca-certificates.pem",
    "clientCertPath": "/path/to/client-cert.pem",
    "clientKeyPath": "/path/to/client-key.pem"
  }
}
```

---

## Configuración como Servicio

### Windows Service

```powershell
# Configurar recuperación automática del servicio
sc.exe failure "SOC-Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000

# Configurar inicio retardado para evitar problemas de red
sc.exe config "SOC-Agent" start= delayed-auto

# Verificar configuración
sc.exe qc "SOC-Agent"
```

### Linux Systemd

```bash
# Habilitar inicio automático
sudo systemctl enable soc-agent

# Configurar reinicio automático
sudo systemctl edit soc-agent
```

Agregar configuración:
```ini
[Service]
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5
```

### macOS LaunchDaemon

```bash
# Verificar que el servicio esté cargado
sudo launchctl list | grep com.soc-inteligente.agent

# Reiniciar servicio si es necesario
sudo launchctl unload /Library/LaunchDaemons/com.soc-inteligente.agent.plist
sudo launchctl load /Library/LaunchDaemons/com.soc-inteligente.agent.plist
```

---

## Verificación de la Instalación

### Comandos de Verificación

**Windows:**
```powershell
# Verificar servicio
Get-Service -Name "SOC-Agent"

# Verificar proceso
Get-Process -Name "soc-agent" -ErrorAction SilentlyContinue

# Verificar logs
Get-Content "C:\Program Files\SOC-Agent\logs\agent.log" -Tail 20

# Verificar conectividad
Test-NetConnection -ComputerName "tu-servidor-soc.com" -Port 443
```

**Linux:**
```bash
# Verificar servicio
systemctl status soc-agent

# Verificar proceso
ps aux | grep soc-agent

# Verificar logs
journalctl -u soc-agent -f
tail -f /opt/soc-agent/logs/agent.log

# Verificar conectividad
curl -I https://tu-servidor-soc.com/api/health
```

**macOS:**
```bash
# Verificar servicio
sudo launchctl list | grep com.soc-inteligente.agent

# Verificar proceso
ps aux | grep soc-agent

# Verificar logs
tail -f /usr/local/soc-agent/logs/agent.log
```

### Verificación de Registro

1. **Comprobar en logs del agente:**
   ```
   [INFO] Agent registration successful, ID: agent-abc123
   [INFO] Heartbeat sent successfully
   [INFO] Data upload completed: 45 events sent
   ```

2. **Comprobar en la interfaz web:**
   - Panel de Agentes → Ver lista de agentes conectados
   - Verificar que el agente aparece como "Activo"
   - Comprobar última conexión reciente

### Pruebas de Funcionalidad

**Prueba de recolección manual:**
```bash
# Linux/macOS
sudo /opt/soc-agent/bin/soc-agent --test-collectors

# Windows
"C:\Program Files\SOC-Agent\soc-agent.exe" --test-collectors
```

**Prueba de conectividad:**
```bash
# Linux/macOS
sudo /opt/soc-agent/bin/soc-agent --test-connection

# Windows
"C:\Program Files\SOC-Agent\soc-agent.exe" --test-connection
```

---

## Desinstalación

### Windows

```powershell
# Detener servicio
Stop-Service -Name "SOC-Agent" -Force

# Eliminar servicio
sc.exe delete "SOC-Agent"

# Desinstalar usando MSI (si se instaló con MSI)
$app = Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "*SOC-Agent*" }
$app.Uninstall()

# Eliminación manual
Remove-Item -Recurse -Force "C:\Program Files\SOC-Agent"
Remove-Item -Force "C:\ProgramData\SOC-Agent\*" -ErrorAction SilentlyContinue
```

### Linux

```bash
# Usando gestor de paquetes
sudo apt-get remove --purge soc-agent  # Debian/Ubuntu
sudo yum remove soc-agent              # CentOS/RHEL

# Eliminación manual
sudo systemctl stop soc-agent
sudo systemctl disable soc-agent
sudo rm /etc/systemd/system/soc-agent.service
sudo systemctl daemon-reload
sudo userdel soc-agent
sudo rm -rf /opt/soc-agent /var/lib/soc-agent
```

### macOS

```bash
# Detener y descargar servicio
sudo launchctl unload /Library/LaunchDaemons/com.soc-inteligente.agent.plist
sudo rm /Library/LaunchDaemons/com.soc-inteligente.agent.plist

# Eliminar archivos
sudo rm -rf /usr/local/soc-agent /usr/local/var/soc-agent

# Eliminar usuario (opcional)
sudo dscl . -delete /Users/_soc-agent
```

---

## Solución de Problemas Comunes

### El agente no se registra

1. **Verificar configuración:**
   - URL del servidor correcta
   - Clave de registro válida
   - Conectividad de red

2. **Verificar logs:**
   ```bash
   # Buscar errores de registro
   grep -i "register\|registration" /opt/soc-agent/logs/agent.log
   ```

### El servicio no inicia

1. **Verificar permisos:**
   ```bash
   # Linux
   ls -la /opt/soc-agent/bin/soc-agent
   sudo chown soc-agent:soc-agent /opt/soc-agent/bin/soc-agent
   ```

2. **Verificar dependencias:**
   ```bash
   # Linux - verificar bibliotecas
   ldd /opt/soc-agent/bin/soc-agent
   ```

### Alto uso de recursos

1. **Ajustar intervalos de recolección:**
   ```json
   {
     "heartbeatInterval": 120,
     "dataUploadInterval": 600,
     "scanInterval": 7200
   }
   ```

2. **Deshabilitar colectores innecesarios:**
   ```json
   {
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": false,
       "registryMonitoring": false
     }
   }
   ```

Esta guía cubre la instalación completa del agente SOC-Inteligente en todas las plataformas soportadas.