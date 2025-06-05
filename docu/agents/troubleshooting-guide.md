# Guía de Resolución de Problemas - Agentes SOC

## Introducción

Esta guía ayuda a diagnosticar y resolver problemas comunes con los agentes del SOC-Inteligente. Incluye síntomas, causas probables y soluciones paso a paso.

## Índice

- [Problemas de Conexión](#problemas-de-conexión)
- [Problemas de Registro](#problemas-de-registro)
- [Problemas de Rendimiento](#problemas-de-rendimiento)
- [Problemas de Configuración](#problemas-de-configuración)
- [Problemas de Servicios](#problemas-de-servicios)
- [Problemas de Colectores](#problemas-de-colectores)
- [Herramientas de Diagnóstico](#herramientas-de-diagnóstico)
- [Logs y Monitoreo](#logs-y-monitoreo)

---

## Problemas de Conexión

### El agente no puede conectarse al servidor

**Síntomas:**
- Logs muestran errores de conexión
- El agente aparece como "Desconectado" en el panel
- Timeouts en las peticiones HTTP/HTTPS

**Diagnóstico:**

1. **Verificar conectividad básica:**
   ```bash
   # Linux/macOS
   curl -I https://tu-servidor-soc.com/api/health
   ping tu-servidor-soc.com
   
   # Windows
   Invoke-WebRequest -Uri "https://tu-servidor-soc.com/api/health" -Method Head
   Test-NetConnection -ComputerName "tu-servidor-soc.com" -Port 443
   ```

2. **Verificar configuración DNS:**
   ```bash
   # Linux/macOS
   nslookup tu-servidor-soc.com
   dig tu-servidor-soc.com
   
   # Windows
   nslookup tu-servidor-soc.com
   Resolve-DnsName tu-servidor-soc.com
   ```

3. **Verificar configuración de proxy:**
   ```bash
   # Verificar variables de entorno
   echo $http_proxy
   echo $https_proxy
   echo $no_proxy
   ```

**Soluciones:**

1. **Configurar proxy corporativo:**
   ```json
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "proxy": {
       "enabled": true,
       "host": "proxy.empresa.com",
       "port": 8080,
       "username": "usuario",
       "password": "contraseña",
       "bypassList": ["localhost", "127.0.0.1", "*.local"]
     }
   }
   ```

2. **Configurar firewall (Windows):**
   ```powershell
   # Permitir tráfico saliente HTTPS
   New-NetFirewallRule -DisplayName "SOC-Agent HTTPS Out" -Direction Outbound -Protocol TCP -RemotePort 443 -Action Allow
   
   # Verificar reglas existentes
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*SOC*"}
   ```

3. **Configurar firewall (Linux):**
   ```bash
   # UFW
   sudo ufw allow out 443/tcp
   
   # iptables
   sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
   
   # Verificar reglas
   sudo ufw status
   sudo iptables -L
   ```

### Errores de certificado SSL/TLS

**Síntomas:**
- "Certificate verification failed"
- "SSL handshake failed"
- "Unable to verify the first certificate"

**Diagnóstico:**
```bash
# Verificar certificado del servidor
openssl s_client -connect tu-servidor-soc.com:443 -servername tu-servidor-soc.com

# Verificar cadena de certificados
curl -vI https://tu-servidor-soc.com/api/health
```

**Soluciones:**

1. **Actualizar certificados del sistema:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update && sudo apt-get install ca-certificates
   
   # CentOS/RHEL
   sudo yum update ca-certificates
   
   # Windows
   certlm.msc # Actualizar manualmente
   ```

2. **Configurar certificados corporativos:**
   ```json
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "ssl": {
       "verifyPeer": true,
       "caCertPath": "/path/to/corporate-ca.pem",
       "allowSelfSigned": false
     }
   }
   ```

3. **Deshabilitar verificación SSL (NO recomendado para producción):**
   ```json
   {
     "ssl": {
       "verifyPeer": false,
       "allowSelfSigned": true
     }
   }
   ```

---

## Problemas de Registro

### El agente no se registra correctamente

**Síntomas:**
- "Invalid registration key"
- "Registration failed"
- El agente no aparece en el panel de administración

**Diagnóstico:**

1. **Verificar clave de registro:**
   ```bash
   # Verificar configuración
   cat /opt/soc-agent/config/agent-config.json | grep registrationKey
   ```

2. **Verificar logs de registro:**
   ```bash
   # Linux
   journalctl -u soc-agent | grep -i register
   tail -f /opt/soc-agent/logs/agent.log | grep -i register
   
   # Windows
   Get-EventLog -LogName Application -Source "SOC-Agent" | Where-Object {$_.Message -like "*register*"}
   ```

**Soluciones:**

1. **Generar nueva clave de registro:**
   - Acceder al panel administrativo
   - Ir a "Agentes" → "Generar Clave de Registro"
   - Actualizar configuración del agente

2. **Verificar límites de la organización:**
   - Verificar que no se haya alcanzado el límite de agentes
   - Actualizar plan si es necesario

3. **Registro manual con debug:**
   ```bash
   # Linux
   sudo /opt/soc-agent/bin/soc-agent --register --log-level debug
   
   # Windows
   "C:\Program Files\SOC-Agent\soc-agent.exe" --register --log-level debug
   ```

### Error "Agent already registered"

**Síntomas:**
- El agente intenta registrarse pero ya existe
- ID de agente duplicado

**Soluciones:**

1. **Limpiar registro existente:**
   ```bash
   # Eliminar ID del agente de la configuración
   sed -i '/"agentId"/d' /opt/soc-agent/config/agent-config.json
   
   # Reiniciar servicio
   sudo systemctl restart soc-agent
   ```

2. **Forzar re-registro:**
   ```bash
   # Linux
   sudo /opt/soc-agent/bin/soc-agent --force-register
   
   # Windows
   "C:\Program Files\SOC-Agent\soc-agent.exe" --force-register
   ```

---

## Problemas de Rendimiento

### Alto uso de CPU

**Síntomas:**
- El proceso del agente consume >20% CPU constantemente
- El sistema se vuelve lento
- Ventiladores del equipo trabajando constantemente

**Diagnóstico:**

1. **Verificar uso de CPU:**
   ```bash
   # Linux
   top -p $(pgrep soc-agent)
   htop -p $(pgrep soc-agent)
   
   # Windows
   Get-Process -Name "soc-agent" | Select-Object CPU,WorkingSet
   ```

2. **Verificar configuración de intervalos:**
   ```bash
   grep -E "(heartbeatInterval|dataUploadInterval|scanInterval)" /opt/soc-agent/config/agent-config.json
   ```

**Soluciones:**

1. **Ajustar intervalos de recolección:**
   ```json
   {
     "heartbeatInterval": 120,     // Aumentar de 60 a 120 segundos
     "dataUploadInterval": 600,    // Aumentar de 300 a 600 segundos
     "scanInterval": 7200,         // Aumentar de 3600 a 7200 segundos
     "collectorsConfig": {
       "batchSize": 50,            // Reducir tamaño de lote
       "maxEventsPerMinute": 100   // Limitar eventos por minuto
     }
   }
   ```

2. **Deshabilitar colectores innecesarios:**
   ```json
   {
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": false,      // Deshabilitar si no es necesario
       "registryMonitoring": false,     // Deshabilitar si no es necesario
       "securityLogsMonitoring": true,
       "malwareScanning": false,        // Deshabilitar si no es necesario
       "vulnerabilityScanning": false   // Deshabilitar si no es necesario
     }
   }
   ```

3. **Configurar límites de recursos:**
   ```json
   {
     "resourceLimits": {
       "maxCpuUsage": 15,          // Límite de CPU al 15%
       "maxMemoryUsage": 128,      // Límite de memoria a 128MB
       "throttleOnHighUsage": true // Activar throttling automático
     }
   }
   ```

### Alto uso de memoria

**Síntomas:**
- El agente consume >200MB de RAM
- Mensajes de "out of memory"
- Sistema swap activándose frecuentemente

**Diagnóstico:**
```bash
# Linux
ps aux | grep soc-agent
cat /proc/$(pgrep soc-agent)/status | grep -i mem

# Windows
Get-Process -Name "soc-agent" | Select-Object WorkingSet,VirtualMemorySize
```

**Soluciones:**

1. **Configurar límites de memoria:**
   ```json
   {
     "queueConfig": {
       "maxSize": 500,           // Reducir tamaño de cola
       "maxMemoryUsage": "64MB"  // Límite de memoria para cola
     },
     "collectorsConfig": {
       "maxCacheSize": "16MB",   // Limitar caché de colectores
       "flushInterval": 30       // Limpiar caché cada 30 segundos
     }
   }
   ```

2. **Configurar limpieza automática:**
   ```json
   {
     "maintenance": {
       "gcInterval": 300,        // Garbage collection cada 5 minutos
       "clearCacheInterval": 600, // Limpiar caché cada 10 minutos
       "maxLogFiles": 5,         // Limitar archivos de log
       "maxLogSize": "50MB"      // Limitar tamaño de logs
     }
   }
   ```

### Alto uso de disco

**Síntomas:**
- Directorio del agente ocupa >1GB
- Logs crecen descontroladamente
- Errores de "disk full"

**Diagnóstico:**
```bash
# Verificar uso de disco del agente
du -sh /opt/soc-agent/
du -sh /opt/soc-agent/logs/

# Verificar archivos más grandes
find /opt/soc-agent/ -type f -size +10M -exec ls -lh {} \;
```

**Soluciones:**

1. **Configurar rotación de logs:**
   ```json
   {
     "logging": {
       "level": "info",              // Reducir nivel de logging
       "maxFileSize": "10MB",        // Máximo 10MB por archivo
       "maxFiles": 3,                // Máximo 3 archivos
       "compress": true              // Comprimir logs antiguos
     }
   }
   ```

2. **Configurar limpieza automática:**
   ```bash
   # Crear script de limpieza
   cat << 'EOF' > /opt/soc-agent/scripts/cleanup.sh
   #!/bin/bash
   
   # Limpiar logs antiguos (>7 días)
   find /opt/soc-agent/logs/ -name "*.log" -mtime +7 -delete
   
   # Limpiar caché temporal (>1 día)
   find /var/lib/soc-agent/cache/ -name "*" -mtime +1 -delete
   
   # Limpiar archivos de queue antiguos (>3 días)
   find /var/lib/soc-agent/queue/ -name "*.json" -mtime +3 -delete
   EOF
   
   chmod +x /opt/soc-agent/scripts/cleanup.sh
   
   # Agregar a crontab (ejecutar diariamente)
   echo "0 2 * * * /opt/soc-agent/scripts/cleanup.sh" | sudo crontab -
   ```

---

## Problemas de Configuración

### Configuración inválida

**Síntomas:**
- El agente no inicia
- Errores de "invalid configuration"
- Valores por defecto no funcionan

**Diagnóstico:**
```bash
# Validar JSON
python -m json.tool /opt/soc-agent/config/agent-config.json

# Verificar permisos
ls -la /opt/soc-agent/config/agent-config.json
```

**Soluciones:**

1. **Crear configuración mínima válida:**
   ```json
   {
     "serverUrl": "https://tu-servidor-soc.com",
     "registrationKey": "tu-clave-de-registro",
     "heartbeatInterval": 60,
     "dataUploadInterval": 300,
     "logLevel": "info",
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": true
     }
   }
   ```

2. **Validar configuración:**
   ```bash
   # Linux
   sudo /opt/soc-agent/bin/soc-agent --validate-config
   
   # Windows
   "C:\Program Files\SOC-Agent\soc-agent.exe" --validate-config
   ```

3. **Restaurar configuración por defecto:**
   ```bash
   # Hacer backup de configuración actual
   cp /opt/soc-agent/config/agent-config.json /opt/soc-agent/config/agent-config.json.bak
   
   # Generar configuración por defecto
   sudo /opt/soc-agent/bin/soc-agent --generate-default-config
   ```

### Problemas de permisos

**Síntomas:**
- "Permission denied" en logs
- El agente no puede escribir archivos
- Errores al acceder a recursos del sistema

**Soluciones:**

1. **Verificar y corregir permisos (Linux):**
   ```bash
   # Verificar usuario del servicio
   ps aux | grep soc-agent
   
   # Corregir permisos de archivos
   sudo chown -R soc-agent:soc-agent /opt/soc-agent/
   sudo chown -R soc-agent:soc-agent /var/lib/soc-agent/
   
   # Verificar permisos de directorio
   sudo chmod 755 /opt/soc-agent/
   sudo chmod 644 /opt/soc-agent/config/agent-config.json
   sudo chmod 755 /opt/soc-agent/bin/soc-agent
   ```

2. **Configurar SELinux (si está habilitado):**
   ```bash
   # Verificar estado de SELinux
   sestatus
   
   # Configurar contexto SELinux
   sudo setsebool -P httpd_can_network_connect 1
   sudo semanage fcontext -a -t bin_t "/opt/soc-agent/bin/soc-agent"
   sudo restorecon -R /opt/soc-agent/
   ```

3. **Configurar privilegios en Windows:**
   ```powershell
   # Ejecutar como administrador
   # Verificar que el servicio se ejecuta como LocalSystem o una cuenta con privilegios suficientes
   Get-Service "SOC-Agent" | Select-Object Name,StartType,Status,ServiceAccount
   
   # Otorgar permisos al directorio
   icacls "C:\Program Files\SOC-Agent" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F"
   ```

---

## Problemas de Servicios

### El servicio no inicia

**Síntomas:**
- "Failed to start" en systemctl/Services
- El proceso termina inmediatamente
- Códigos de salida diferentes de 0

**Diagnóstico:**

1. **Linux (systemd):**
   ```bash
   # Verificar estado del servicio
   systemctl status soc-agent
   
   # Ver logs del servicio
   journalctl -u soc-agent -n 50
   
   # Verificar archivo de servicio
   systemctl cat soc-agent
   
   # Verificar dependencias
   systemctl list-dependencies soc-agent
   ```

2. **Windows:**
   ```powershell
   # Verificar estado del servicio
   Get-Service -Name "SOC-Agent"
   
   # Ver logs de eventos
   Get-EventLog -LogName System -Source "Service Control Manager" | Where-Object {$_.Message -like "*SOC-Agent*"}
   
   # Intentar inicio manual
   sc.exe start "SOC-Agent"
   ```

**Soluciones:**

1. **Verificar dependencias (Linux):**
   ```bash
   # Verificar que las bibliotecas requeridas están disponibles
   ldd /opt/soc-agent/bin/soc-agent
   
   # Instalar dependencias faltantes
   sudo apt-get install libc6 libssl1.1  # Ubuntu/Debian
   sudo yum install glibc openssl-libs    # CentOS/RHEL
   ```

2. **Recrear servicio (Linux):**
   ```bash
   # Detener y deshabilitar servicio actual
   sudo systemctl stop soc-agent
   sudo systemctl disable soc-agent
   
   # Recrear archivo de servicio
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
   
   [Install]
   WantedBy=multi-user.target
   EOF
   
   # Recargar systemd y habilitar servicio
   sudo systemctl daemon-reload
   sudo systemctl enable soc-agent
   sudo systemctl start soc-agent
   ```

3. **Reinstalar servicio (Windows):**
   ```powershell
   # Detener y eliminar servicio existente
   Stop-Service -Name "SOC-Agent" -Force
   sc.exe delete "SOC-Agent"
   
   # Reinstalar servicio
   New-Service -Name "SOC-Agent" -BinaryPathName "C:\Program Files\SOC-Agent\soc-agent.exe --service" -Description "SOC-Inteligente Security Agent" -StartupType Automatic
   
   # Configurar recuperación automática
   sc.exe failure "SOC-Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000
   
   # Iniciar servicio
   Start-Service -Name "SOC-Agent"
   ```

### El servicio se detiene inesperadamente

**Síntomas:**
- El servicio se detiene sin razón aparente
- Reinicios constantes del servicio
- Códigos de salida inesperados

**Diagnóstico:**
```bash
# Verificar logs para patrones de error
journalctl -u soc-agent | grep -i "exit\|crash\|segfault\|killed"

# Verificar recursos del sistema
free -m
df -h
```

**Soluciones:**

1. **Configurar monitoreo del servicio:**
   ```bash
   # Crear script de monitoreo
   cat << 'EOF' > /opt/soc-agent/scripts/monitor.sh
   #!/bin/bash
   
   SERVICE="soc-agent"
   
   while true; do
     if ! systemctl is-active --quiet $SERVICE; then
       echo "$(date): $SERVICE stopped, restarting..." >> /var/log/soc-agent-monitor.log
       systemctl start $SERVICE
     fi
     sleep 30
   done
   EOF
   
   chmod +x /opt/soc-agent/scripts/monitor.sh
   
   # Crear servicio de monitoreo
   sudo tee /etc/systemd/system/soc-agent-monitor.service > /dev/null << 'EOF'
   [Unit]
   Description=SOC Agent Monitor
   After=soc-agent.service
   
   [Service]
   Type=simple
   ExecStart=/opt/soc-agent/scripts/monitor.sh
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   EOF
   
   sudo systemctl enable soc-agent-monitor
   sudo systemctl start soc-agent-monitor
   ```

---

## Problemas de Colectores

### Los colectores no recopilan datos

**Síntomas:**
- No se generan eventos
- Los colectores aparecen como inactivos
- Logs muestran errores de colección

**Diagnóstico:**
```bash
# Verificar estado de colectores
sudo /opt/soc-agent/bin/soc-agent --list-collectors

# Probar colectores individualmente
sudo /opt/soc-agent/bin/soc-agent --test-collectors
```

**Soluciones:**

1. **Habilitar colectores específicos:**
   ```json
   {
     "capabilities": {
       "fileSystemMonitoring": true,
       "processMonitoring": true,
       "networkMonitoring": true,
       "registryMonitoring": true,
       "securityLogsMonitoring": true
     },
     "collectorsConfig": {
       "windows": {
         "eventLog": {
           "enabled": true,
           "channels": ["Security", "System", "Application"]
         },
         "processes": {
           "enabled": true,
           "interval": 30
         }
       }
     }
   }
   ```

2. **Verificar permisos de colectores (Windows):**
   ```powershell
   # Verificar permisos para Event Log
   wevtutil gl Security
   
   # Agregar permisos si es necesario
   wevtutil sl Security /ca:O:BAG:SYD:(A;;0xf0005;;;SY)(A;;0x5;;;BA)(A;;0x1;;;S-1-5-32-573)
   ```

3. **Verificar permisos de colectores (Linux):**
   ```bash
   # Verificar permisos para archivos de log
   ls -la /var/log/syslog /var/log/auth.log
   
   # Agregar usuario a grupos necesarios
   sudo usermod -a -G adm,syslog soc-agent
   ```

### Colectores generan demasiados eventos

**Síntomas:**
- Miles de eventos por minuto
- Alto uso de recursos
- El servidor se sobrecarga

**Soluciones:**

1. **Configurar filtros:**
   ```json
   {
     "collectorsConfig": {
       "eventFilters": {
         "excludeTypes": ["debug", "trace"],
         "excludeProcesses": ["chrome.exe", "firefox.exe"],
         "excludePaths": ["/tmp", "/var/tmp"],
         "minSeverity": "medium"
       },
       "rateLimiting": {
         "maxEventsPerMinute": 100,
         "maxEventsPerHour": 1000,
         "throttleOnExcess": true
       }
     }
   }
   ```

2. **Configurar agregación:**
   ```json
   {
     "collectorsConfig": {
       "aggregation": {
         "enabled": true,
         "window": 300,        // 5 minutos
         "maxSimilarEvents": 10,
         "groupByFields": ["type", "source"]
       }
     }
   }
   ```

---

## Herramientas de Diagnóstico

### Script de Diagnóstico Automático

```bash
#!/bin/bash
# diagnose-agent.sh

echo "=== SOC Agent Diagnostic Script ==="
echo "Date: $(date)"
echo

# Información del sistema
echo "=== System Information ==="
echo "OS: $(uname -a)"
echo "Memory: $(free -h | grep Mem)"
echo "Disk: $(df -h / | tail -1)"
echo

# Estado del servicio
echo "=== Service Status ==="
systemctl status soc-agent --no-pager
echo

# Información del proceso
echo "=== Process Information ==="
ps aux | grep soc-agent | grep -v grep
echo

# Uso de recursos
echo "=== Resource Usage ==="
if pgrep soc-agent > /dev/null; then
    PID=$(pgrep soc-agent)
    echo "CPU Usage: $(ps -p $PID -o %cpu --no-headers)"
    echo "Memory Usage: $(ps -p $PID -o %mem --no-headers)"
    echo "Memory (RSS): $(ps -p $PID -o rss --no-headers) KB"
fi
echo

# Configuración
echo "=== Configuration ==="
if [ -f /opt/soc-agent/config/agent-config.json ]; then
    echo "Config file exists: ✓"
    echo "Config validation:"
    python -m json.tool /opt/soc-agent/config/agent-config.json > /dev/null 2>&1 && echo "  JSON valid: ✓" || echo "  JSON valid: ✗"
else
    echo "Config file exists: ✗"
fi
echo

# Conectividad
echo "=== Connectivity ==="
SERVER_URL=$(grep -o '"serverUrl": *"[^"]*"' /opt/soc-agent/config/agent-config.json 2>/dev/null | cut -d'"' -f4)
if [ -n "$SERVER_URL" ]; then
    echo "Server URL: $SERVER_URL"
    curl -I "$SERVER_URL/api/health" --connect-timeout 10 --max-time 30 2>/dev/null && echo "  Connectivity: ✓" || echo "  Connectivity: ✗"
else
    echo "Server URL: Not configured"
fi
echo

# Logs recientes
echo "=== Recent Logs ==="
journalctl -u soc-agent --since "1 hour ago" --no-pager | tail -20
echo

# Archivos importantes
echo "=== Important Files ==="
echo "Checking file permissions:"
ls -la /opt/soc-agent/bin/soc-agent 2>/dev/null || echo "  Binary: ✗"
ls -la /opt/soc-agent/config/agent-config.json 2>/dev/null || echo "  Config: ✗"
ls -la /opt/soc-agent/logs/ 2>/dev/null || echo "  Log directory: ✗"
echo

echo "=== Diagnosis Complete ==="
```

### Script de Diagnóstico para Windows

```powershell
# diagnose-agent.ps1

Write-Host "=== SOC Agent Diagnostic Script ===" -ForegroundColor Green
Write-Host "Date: $(Get-Date)"
Write-Host ""

# Información del sistema
Write-Host "=== System Information ===" -ForegroundColor Yellow
Write-Host "OS: $((Get-CimInstance Win32_OperatingSystem).Caption)"
Write-Host "Memory: $([math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB, 2)) GB"
Write-Host "Free Memory: $([math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB, 2)) GB"
Write-Host ""

# Estado del servicio
Write-Host "=== Service Status ===" -ForegroundColor Yellow
Get-Service -Name "SOC-Agent" -ErrorAction SilentlyContinue | Format-Table -AutoSize
Write-Host ""

# Información del proceso
Write-Host "=== Process Information ===" -ForegroundColor Yellow
Get-Process -Name "soc-agent" -ErrorAction SilentlyContinue | Select-Object Name,Id,CPU,WorkingSet | Format-Table -AutoSize
Write-Host ""

# Configuración
Write-Host "=== Configuration ===" -ForegroundColor Yellow
$configPath = "C:\Program Files\SOC-Agent\agent-config.json"
if (Test-Path $configPath) {
    Write-Host "Config file exists: ✓" -ForegroundColor Green
    try {
        Get-Content $configPath | ConvertFrom-Json | Out-Null
        Write-Host "JSON valid: ✓" -ForegroundColor Green
    } catch {
        Write-Host "JSON valid: ✗" -ForegroundColor Red
    }
} else {
    Write-Host "Config file exists: ✗" -ForegroundColor Red
}
Write-Host ""

# Conectividad
Write-Host "=== Connectivity ===" -ForegroundColor Yellow
try {
    $config = Get-Content $configPath | ConvertFrom-Json
    $serverUrl = $config.serverUrl
    Write-Host "Server URL: $serverUrl"
    
    $response = Invoke-WebRequest -Uri "$serverUrl/api/health" -Method Head -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Connectivity: ✓" -ForegroundColor Green
} catch {
    Write-Host "Connectivity: ✗" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
}
Write-Host ""

# Logs recientes
Write-Host "=== Recent Event Logs ===" -ForegroundColor Yellow
Get-EventLog -LogName Application -Source "SOC-Agent" -Newest 10 -ErrorAction SilentlyContinue | 
    Select-Object TimeGenerated,EntryType,Message | Format-Table -Wrap
Write-Host ""

# Archivos importantes
Write-Host "=== Important Files ===" -ForegroundColor Yellow
Write-Host "Checking file existence:"
@(
    "C:\Program Files\SOC-Agent\soc-agent.exe",
    "C:\Program Files\SOC-Agent\agent-config.json",
    "C:\Program Files\SOC-Agent\logs\"
) | ForEach-Object {
    if (Test-Path $_) {
        Write-Host "  $($_): ✓" -ForegroundColor Green
    } else {
        Write-Host "  $($_): ✗" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=== Diagnosis Complete ===" -ForegroundColor Green
```

### Herramientas de Red

```bash
# Verificar conectividad detallada
function test_connectivity() {
    local url=$1
    local host=$(echo $url | sed 's|https\?://||' | sed 's|/.*||')
    
    echo "Testing connectivity to $host..."
    
    # DNS resolution
    echo -n "DNS resolution: "
    if nslookup $host > /dev/null 2>&1; then
        echo "✓"
    else
        echo "✗"
        return 1
    fi
    
    # Ping
    echo -n "Ping: "
    if ping -c 1 -W 5 $host > /dev/null 2>&1; then
        echo "✓"
    else
        echo "✗"
    fi
    
    # Port 443
    echo -n "Port 443: "
    if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$host/443" 2>/dev/null; then
        echo "✓"
    else
        echo "✗"
        return 1
    fi
    
    # HTTP/HTTPS
    echo -n "HTTP(S) request: "
    if curl -I "$url/api/health" --connect-timeout 10 --max-time 30 -s > /dev/null 2>&1; then
        echo "✓"
    else
        echo "✗"
        return 1
    fi
    
    return 0
}

# Uso
test_connectivity "https://tu-servidor-soc.com"
```

---

## Logs y Monitoreo

### Configuración de Logging Detallado

```json
{
  "logging": {
    "level": "debug",
    "outputs": [
      {
        "type": "file",
        "path": "/opt/soc-agent/logs/agent.log",
        "maxSize": "50MB",
        "maxFiles": 5,
        "format": "json"
      },
      {
        "type": "syslog",
        "facility": "daemon",
        "tag": "soc-agent"
      }
    ],
    "components": {
      "collector": "debug",
      "communication": "debug",
      "queue": "info",
      "heartbeat": "info"
    }
  }
}
```

### Análisis de Logs

```bash
# Buscar errores específicos
grep -i "error\|failed\|exception" /opt/soc-agent/logs/agent.log | tail -20

# Buscar patrones de conexión
grep -i "connect\|register\|heartbeat" /opt/soc-agent/logs/agent.log | tail -20

# Estadísticas de eventos
grep "events sent" /opt/soc-agent/logs/agent.log | awk '{print $NF}' | 
  awk '{sum+=$1; count++} END {print "Total events:", sum, "Average:", sum/count}'

# Análisis de rendimiento
grep "collection time" /opt/soc-agent/logs/agent.log | awk '{print $(NF-1)}' |
  awk '{sum+=$1; count++; if($1>max) max=$1} END {print "Avg:", sum/count "ms", "Max:", max "ms"}'
```

### Monitoreo con Scripts

```bash
# monitor-agent.sh
#!/bin/bash

LOG_FILE="/var/log/soc-agent-monitor.log"
ALERT_EMAIL="admin@empresa.com"

check_agent_health() {
    local status="OK"
    local message=""
    
    # Verificar que el servicio esté corriendo
    if ! systemctl is-active --quiet soc-agent; then
        status="CRITICAL"
        message="Service is not running"
        return 1
    fi
    
    # Verificar última actividad (debe ser < 5 minutos)
    local last_activity=$(journalctl -u soc-agent --since "5 minutes ago" | wc -l)
    if [ $last_activity -eq 0 ]; then
        status="WARNING"
        message="No activity in last 5 minutes"
    fi
    
    # Verificar uso de memoria
    local memory_usage=$(ps -p $(pgrep soc-agent) -o %mem --no-headers 2>/dev/null)
    if [ $(echo "$memory_usage > 50" | bc -l 2>/dev/null) -eq 1 ]; then
        status="WARNING"
        message="High memory usage: ${memory_usage}%"
    fi
    
    # Verificar errores recientes
    local recent_errors=$(journalctl -u soc-agent --since "1 hour ago" | grep -i error | wc -l)
    if [ $recent_errors -gt 10 ]; then
        status="WARNING"
        message="High error rate: $recent_errors errors in last hour"
    fi
    
    echo "$(date): $status - $message" >> $LOG_FILE
    
    # Enviar alerta si es crítico
    if [ "$status" = "CRITICAL" ]; then
        echo "SOC Agent CRITICAL: $message" | mail -s "SOC Agent Alert" $ALERT_EMAIL
    fi
}

# Ejecutar cada minuto
check_agent_health
```

### Dashboard de Monitoreo

```bash
# status-dashboard.sh
#!/bin/bash

clear
echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                           SOC AGENT STATUS DASHBOARD                          ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo

# Estado del servicio
echo "┌─ Service Status ──────────────────────────────────────────────────────────────┐"
if systemctl is-active --quiet soc-agent; then
    echo "│ Status: 🟢 RUNNING                                                            │"
    echo "│ Uptime: $(systemctl show soc-agent --property=ActiveEnterTimestamp --value | xargs -I {} date -d {} +'since %Y-%m-%d %H:%M:%S')"
else
    echo "│ Status: 🔴 STOPPED                                                            │"
fi
echo "└───────────────────────────────────────────────────────────────────────────────┘"
echo

# Información del proceso
if pgrep soc-agent > /dev/null; then
    PID=$(pgrep soc-agent)
    echo "┌─ Process Information ─────────────────────────────────────────────────────────┐"
    echo "│ PID: $PID"
    echo "│ CPU: $(ps -p $PID -o %cpu --no-headers)%"
    echo "│ Memory: $(ps -p $PID -o %mem --no-headers)% ($(ps -p $PID -o rss --no-headers) KB)"
    echo "└───────────────────────────────────────────────────────────────────────────────┘"
    echo
fi

# Estadísticas de eventos
echo "┌─ Event Statistics (Last Hour) ────────────────────────────────────────────────┐"
EVENTS_SENT=$(journalctl -u soc-agent --since "1 hour ago" | grep "events sent" | wc -l)
ERRORS=$(journalctl -u soc-agent --since "1 hour ago" | grep -i error | wc -l)
echo "│ Events Sent: $EVENTS_SENT"
echo "│ Errors: $ERRORS"
echo "└───────────────────────────────────────────────────────────────────────────────┘"
echo

# Últimos logs
echo "┌─ Recent Logs ─────────────────────────────────────────────────────────────────┐"
journalctl -u soc-agent --since "10 minutes ago" --no-pager | tail -5 | while read line; do
    echo "│ $line"
done
echo "└───────────────────────────────────────────────────────────────────────────────┘"

echo
echo "Last updated: $(date)"
echo "Press Ctrl+C to exit, or wait 30 seconds for refresh..."

sleep 30
exec $0  # Reiniciar script para refrescar
```

Esta guía de resolución de problemas cubre los escenarios más comunes que pueden presentarse con los agentes del SOC-Inteligente y proporciona herramientas para el diagnóstico y la resolución efectiva de problemas.