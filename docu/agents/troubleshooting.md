# Guía de Resolución de Problemas - Agentes SOC

## Introducción

Esta guía cubre los problemas más comunes que pueden ocurrir con los agentes SOC y sus soluciones paso a paso.

## Diagnóstico Inicial

### Herramientas de Diagnóstico

```bash
# Verificar estado del agente
./soc-agent --status

# Mostrar configuración actual
./soc-agent --show-config

# Test de conectividad
./soc-agent --test-connection

# Verificar logs en tiempo real
tail -f /var/log/soc-agent/agent.log

# Análisis de rendimiento
./soc-agent --performance-report
```

### Información del Sistema

```bash
# Información del agente
./soc-agent --version
./soc-agent --system-info

# Recursos del sistema
ps aux | grep soc-agent
top -p $(pgrep soc-agent)
lsof -p $(pgrep soc-agent)

# Conectividad de red
netstat -an | grep ESTABLISHED | grep $(pgrep soc-agent)
ss -tuln | grep soc-agent
```

## Problemas de Instalación

### 1. Error: Permisos Insuficientes

**Síntomas:**
- Error "Permission denied" durante la instalación
- El agente no puede crear archivos de configuración
- Fallos al escribir logs

**Diagnóstico:**
```bash
# Verificar permisos del directorio de instalación
ls -la /usr/local/bin/soc-agent
ls -la /etc/soc-agent/
ls -la /var/log/soc-agent/

# Verificar usuario actual
whoami
id
```

**Solución:**
```bash
# Instalar con permisos administrativos
sudo ./install-agent.sh

# Crear usuario específico para el agente (Linux)
sudo useradd -r -s /bin/false soc-agent
sudo mkdir -p /etc/soc-agent /var/log/soc-agent /var/lib/soc-agent
sudo chown -R soc-agent:soc-agent /etc/soc-agent /var/log/soc-agent /var/lib/soc-agent
sudo chmod 750 /etc/soc-agent /var/log/soc-agent /var/lib/soc-agent

# Windows: Ejecutar como Administrador
# Clic derecho -> "Ejecutar como administrador"
```

### 2. Error: Dependencias Faltantes

**Síntomas:**
- Error "Module not found"
- El agente no inicia
- Fallos de importación

**Diagnóstico:**
```bash
# Verificar dependencias del binario (Linux)
ldd ./soc-agent

# Verificar librerías disponibles
ldconfig -p | grep ssl
ldconfig -p | grep crypto

# Windows: Verificar DLLs
dumpbin /dependents soc-agent.exe
```

**Solución:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install libc6 libssl1.1 libgcc1

# CentOS/RHEL
sudo yum install glibc openssl-libs libgcc

# Windows: Instalar Visual C++ Redistributable
# Descargar e instalar Microsoft Visual C++ Redistributable
```

### 3. Error: Arquitectura Incompatible

**Síntomas:**
- Error "cannot execute binary file"
- "Exec format error"

**Diagnóstico:**
```bash
# Verificar arquitectura del sistema
uname -m
arch

# Verificar arquitectura del binario
file ./soc-agent
```

**Solución:**
```bash
# Descargar el binario correcto para su arquitectura
# x86_64 / amd64: soc-agent-linux-x64
# ARM64: soc-agent-linux-arm64
# Windows x64: soc-agent-windows.exe
```

## Problemas de Conexión

### 1. Error: No se Puede Conectar al Servidor

**Síntomas:**
- "Connection refused"
- "Connection timeout"
- "DNS resolution failed"

**Diagnóstico:**
```bash
# Test de conectividad básica
ping soc.miempresa.com
nslookup soc.miempresa.com
telnet soc.miempresa.com 443

# Test HTTPS
curl -v https://soc.miempresa.com/api/health
wget --spider https://soc.miempresa.com/api/health

# Verificar certificados SSL
openssl s_client -connect soc.miempresa.com:443 -servername soc.miempresa.com
```

**Solución:**
```bash
# 1. Verificar configuración de red
cat /etc/resolv.conf
route -n

# 2. Verificar firewall
# Linux (iptables)
sudo iptables -L OUTPUT
sudo ufw status

# Linux (firewalld)
sudo firewall-cmd --list-all

# Windows
netsh advfirewall show allprofiles

# 3. Configurar proxy si es necesario
export https_proxy=http://proxy.empresa.com:8080
export http_proxy=http://proxy.empresa.com:8080

# 4. Actualizar configuración del agente
nano /etc/soc-agent/agent-config.yaml
# Modificar serverUrl, agregar configuración de proxy
```

### 2. Error: Certificado SSL Inválido

**Síntomas:**
- "Certificate verification failed"
- "SSL handshake failed"
- "Certificate has expired"

**Diagnóstico:**
```bash
# Verificar certificado del servidor
openssl s_client -connect soc.miempresa.com:443 -servername soc.miempresa.com 2>/dev/null | openssl x509 -noout -dates

# Verificar CA store local
openssl version -d
ls -la /etc/ssl/certs/
```

**Solución:**
```bash
# 1. Actualizar certificados del sistema
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ca-certificates
sudo update-ca-certificates

# CentOS/RHEL
sudo yum update ca-certificates

# 2. Deshabilitar validación temporalmente (solo para testing)
# En agent-config.yaml:
validateCertificates: false
allowInsecureConnections: true

# 3. Agregar certificado personalizado
sudo cp server-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

### 3. Error: Autenticación Fallida

**Síntomas:**
- "Authentication failed"
- "Invalid organization key"
- "Access denied"

**Diagnóstico:**
```bash
# Verificar configuración de autenticación
grep -E "(organizationKey|agentId)" /etc/soc-agent/agent-config.yaml

# Test manual de autenticación
curl -X POST https://soc.miempresa.com/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"organizationKey": "tu_clave_aqui"}'
```

**Solución:**
```bash
# 1. Verificar clave de organización
# Obtener nueva clave desde el panel de administración

# 2. Regenerar ID del agente
./soc-agent --regenerate-id

# 3. Re-registrar agente
./soc-agent --register --force
```

## Problemas de Rendimiento

### 1. Alto Uso de CPU

**Síntomas:**
- CPU del agente > 25%
- Sistema lento
- Otros procesos afectados

**Diagnóstico:**
```bash
# Monitorear uso de CPU
top -p $(pgrep soc-agent)
htop -p $(pgrep soc-agent)

# Profiling del agente
strace -p $(pgrep soc-agent) -c -S time

# Verificar colectores activos
./soc-agent --list-collectors
```

**Solución:**
```bash
# 1. Ajustar configuración de colectores
# En agent-config.yaml:
collectorSettings:
  process:
    scanInterval: 60        # Aumentar intervalo
  filesystem:
    excludePaths:           # Excluir más directorios
      - "/var/cache"
      - "/tmp"

# 2. Limitar recursos del agente
advanced:
  cpuLimit: 15             # Limitar a 15% CPU
  memoryLimit: 256         # Limitar a 256MB

# 3. Deshabilitar colectores innecesarios
enabledCollectors:
  - "process"              # Solo colectores esenciales
```

### 2. Alto Uso de Memoria

**Síntomas:**
- Memoria del agente > 512MB
- Memory leaks
- Sistema con poca memoria disponible

**Diagnóstico:**
```bash
# Monitorear uso de memoria
ps aux | grep soc-agent
pmap $(pgrep soc-agent)

# Verificar memory leaks
valgrind --leak-check=full ./soc-agent

# Verificar tamaño de cola
./soc-agent --queue-status
```

**Solución:**
```bash
# 1. Ajustar tamaño de cola
# En agent-config.yaml:
queueSize: 500              # Reducir tamaño de cola
dataUploadInterval: 180     # Enviar datos más frecuentemente

# 2. Habilitar compresión
compressionEnabled: true

# 3. Configurar límites estrictos
advanced:
  memoryLimit: 256         # Límite estricto de memoria
  
# 4. Reiniciar agente periódicamente
# Configurar cron job para reinicio nocturno
0 2 * * * systemctl restart soc-agent
```

### 3. Problemas de I/O de Disco

**Síntomas:**
- Alta actividad de disco
- Logs que crecen excesivamente
- Espacio en disco insuficiente

**Diagnóstico:**
```bash
# Monitorear I/O
iotop -p $(pgrep soc-agent)
iostat -x 1

# Verificar tamaño de logs
du -sh /var/log/soc-agent/
ls -lah /var/log/soc-agent/

# Verificar espacio en disco
df -h
```

**Solución:**
```bash
# 1. Configurar rotación de logs
# En agent-config.yaml:
maxLogSize: 10485760        # 10MB por archivo
maxLogAge: 7               # 7 días de retención
logRotationCount: 3        # Máximo 3 archivos

# 2. Reducir nivel de logging
logLevel: "warn"           # Solo warnings y errores

# 3. Configurar logrotate (Linux)
sudo cat > /etc/logrotate.d/soc-agent << EOF
/var/log/soc-agent/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

# 4. Limpiar logs antiguos
find /var/log/soc-agent/ -name "*.log.*" -mtime +7 -delete
```

## Problemas de Colectores

### 1. Colector No Inicia

**Síntomas:**
- "Failed to start collector"
- Colector aparece como "stopped"
- Datos faltantes de colector específico

**Diagnóstico:**
```bash
# Verificar estado de colectores
./soc-agent --list-collectors

# Logs específicos del colector
grep "collector_name" /var/log/soc-agent/agent.log

# Test manual del colector
./soc-agent --test-collector process
```

**Solución:**
```bash
# 1. Verificar permisos específicos del colector
# Para colector de procesos (Linux)
ls -la /proc/
cat /proc/1/stat 2>/dev/null || echo "Sin permisos"

# Para colector de filesystem
inotifywait --help >/dev/null 2>&1 || echo "inotify no disponible"

# 2. Verificar dependencias
# Windows: Verificar acceso a WMI
wmic process list brief

# 3. Habilitar solo colectores compatibles
enabledCollectors:
  - "process"              # Remover colectores problemáticos
```

### 2. Datos Duplicados o Faltantes

**Síntomas:**
- Eventos duplicados en el servidor
- Gaps en los datos recolectados
- Timestamps incorrectos

**Diagnóstico:**
```bash
# Verificar cola de eventos
./soc-agent --queue-status

# Verificar sincronización de tiempo
timedatectl status
ntpq -p

# Verificar logs de envío
grep "upload" /var/log/soc-agent/agent.log
```

**Solución:**
```bash
# 1. Sincronizar tiempo del sistema
sudo ntpdate -s time.nist.gov
sudo systemctl enable ntp

# 2. Ajustar configuración de cola
queuePersistPath: "/var/lib/soc-agent/queue"
queueSize: 1000

# 3. Verificar configuración de intervalos
dataUploadInterval: 300    # 5 minutos
scanInterval: 3600        # 1 hora

# 4. Limpiar cola corrupta
sudo systemctl stop soc-agent
sudo rm -rf /var/lib/soc-agent/queue/*
sudo systemctl start soc-agent
```

## Problemas de Comandos Remotos

### 1. Comandos No se Ejecutan

**Síntomas:**
- "Command execution disabled"
- Comandos quedan en estado "pending"
- Timeouts en ejecución

**Diagnóstico:**
```bash
# Verificar configuración de comandos
grep -E "(enableCommands|allowedCommands)" /etc/soc-agent/agent-config.yaml

# Verificar conexión WebSocket
./soc-agent --test-websocket

# Logs de comandos
grep "command" /var/log/soc-agent/agent.log
```

**Solución:**
```bash
# 1. Habilitar comandos
# En agent-config.yaml:
enableCommands: true
allowedCommands:
  - "collect_now"
  - "update_config"
  - "get_status"

# 2. Verificar permisos de ejecución
commandTempDir: "/tmp/soc-agent"
sudo mkdir -p /tmp/soc-agent
sudo chmod 755 /tmp/soc-agent

# 3. Aumentar timeout
commandTimeout: 120000     # 2 minutos
```

### 2. Comandos Fallan por Seguridad

**Síntomas:**
- "Security validation failed"
- "Command not allowed"
- "Invalid signature"

**Diagnóstico:**
```bash
# Verificar configuración de seguridad
grep -E "(signMessages|validateCertificates)" /etc/soc-agent/agent-config.yaml

# Verificar claves
ls -la /etc/soc-agent/*.key /etc/soc-agent/*.pub
```

**Solución:**
```bash
# 1. Regenerar claves de comando
./soc-agent --regenerate-command-keys

# 2. Sincronizar claves con servidor
./soc-agent --sync-keys

# 3. Temporalmente deshabilitar validación (solo testing)
# En agent-config.yaml:
signMessages: false
```

## Problemas de Actualización

### 1. Actualización Falla

**Síntomas:**
- "Update failed"
- Agente no reinicia después de actualización
- Versión no cambia

**Diagnóstico:**
```bash
# Verificar logs de actualización
grep "update" /var/log/soc-agent/agent.log

# Verificar permisos de actualización
ls -la $(which soc-agent)

# Verificar backup
ls -la /var/lib/soc-agent/backup/
```

**Solución:**
```bash
# 1. Verificar permisos de escritura
sudo chown soc-agent:soc-agent $(which soc-agent)
sudo chmod 755 $(which soc-agent)

# 2. Crear directorio de backup
sudo mkdir -p /var/lib/soc-agent/backup
sudo chown soc-agent:soc-agent /var/lib/soc-agent/backup

# 3. Actualización manual
wget https://updates.soc.company.com/agents/latest/soc-agent-linux
sudo systemctl stop soc-agent
sudo cp soc-agent-linux $(which soc-agent)
sudo systemctl start soc-agent

# 4. Verificar actualización
./soc-agent --version
```

### 2. Rollback Necesario

**Síntomas:**
- Nueva versión no funciona correctamente
- Errores después de actualización
- Rendimiento degradado

**Diagnóstico:**
```bash
# Verificar backup disponible
ls -la /var/lib/soc-agent/backup/

# Verificar logs de error
tail -n 100 /var/log/soc-agent/agent.log
```

**Solución:**
```bash
# 1. Rollback automático
./soc-agent --rollback

# 2. Rollback manual
sudo systemctl stop soc-agent
sudo cp /var/lib/soc-agent/backup/soc-agent-previous $(which soc-agent)
sudo systemctl start soc-agent

# 3. Verificar rollback
./soc-agent --version
./soc-agent --status
```

## Herramientas de Monitoreo

### Script de Health Check

```bash
#!/bin/bash
# health-check.sh - Script de verificación de salud del agente

echo "=== SOC Agent Health Check ==="

# Verificar proceso
if pgrep -x "soc-agent" > /dev/null; then
    echo "✓ Proceso del agente está ejecutándose"
    PID=$(pgrep -x "soc-agent")
    echo "  PID: $PID"
else
    echo "✗ Proceso del agente NO está ejecutándose"
    exit 1
fi

# Verificar archivos de configuración
if [ -f "/etc/soc-agent/agent-config.yaml" ]; then
    echo "✓ Archivo de configuración existe"
else
    echo "✗ Archivo de configuración NO encontrado"
fi

# Verificar conectividad
if ./soc-agent --test-connection >/dev/null 2>&1; then
    echo "✓ Conectividad con servidor OK"
else
    echo "✗ Problema de conectividad con servidor"
fi

# Verificar uso de recursos
CPU_USAGE=$(ps -p $PID -o pcpu= | tr -d ' ')
MEM_USAGE=$(ps -p $PID -o pmem= | tr -d ' ')

echo "📊 Uso de recursos:"
echo "  CPU: ${CPU_USAGE}%"
echo "  Memoria: ${MEM_USAGE}%"

# Verificar logs recientes
RECENT_ERRORS=$(tail -n 100 /var/log/soc-agent/agent.log | grep -c "ERROR")
if [ $RECENT_ERRORS -gt 0 ]; then
    echo "⚠️  $RECENT_ERRORS errores recientes en logs"
else
    echo "✓ Sin errores recientes en logs"
fi

echo "=== Health Check Completado ==="
```

### Monitoreo Continuo

```bash
#!/bin/bash
# monitor.sh - Script de monitoreo continuo

while true; do
    if ! pgrep -x "soc-agent" > /dev/null; then
        echo "$(date): CRITICAL - Agente no está ejecutándose"
        # Reiniciar agente
        systemctl start soc-agent
        sleep 10
    fi
    
    # Verificar uso de memoria
    MEM_MB=$(ps -p $(pgrep soc-agent) -o rss= | tr -d ' ')
    if [ $MEM_MB -gt 512000 ]; then  # 512MB
        echo "$(date): WARNING - Alto uso de memoria: ${MEM_MB}KB"
    fi
    
    sleep 60
done
```

## Contacto y Soporte

### Información para Reportar Problemas

Cuando reporte un problema, incluya:

1. **Versión del agente**: `./soc-agent --version`
2. **Sistema operativo**: `uname -a`
3. **Configuración**: `/etc/soc-agent/agent-config.yaml` (sin datos sensibles)
4. **Logs relevantes**: `/var/log/soc-agent/agent.log`
5. **Descripción del problema**: Síntomas específicos
6. **Pasos para reproducir**: Si es reproducible

### Recolección de Información de Diagnóstico

```bash
#!/bin/bash
# collect-diagnostics.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DIAG_DIR="/tmp/soc-agent-diagnostics-$TIMESTAMP"
mkdir -p "$DIAG_DIR"

echo "Recolectando información de diagnóstico..."

# Información del sistema
uname -a > "$DIAG_DIR/system-info.txt"
cat /etc/os-release >> "$DIAG_DIR/system-info.txt"

# Información del agente
./soc-agent --version > "$DIAG_DIR/agent-version.txt"
./soc-agent --show-config > "$DIAG_DIR/agent-config.txt"
./soc-agent --list-collectors > "$DIAG_DIR/collectors.txt"

# Logs (últimas 1000 líneas)
tail -n 1000 /var/log/soc-agent/agent.log > "$DIAG_DIR/agent.log"

# Información de procesos
ps aux | grep soc-agent > "$DIAG_DIR/processes.txt"

# Información de red
ss -tuln > "$DIAG_DIR/network.txt"
netstat -rn > "$DIAG_DIR/routes.txt"

# Crear archivo comprimido
tar -czf "soc-agent-diagnostics-$TIMESTAMP.tar.gz" -C /tmp "soc-agent-diagnostics-$TIMESTAMP"
rm -rf "$DIAG_DIR"

echo "Diagnóstico creado: soc-agent-diagnostics-$TIMESTAMP.tar.gz"
```

Esta guía cubre los problemas más comunes y sus soluciones. Para problemas específicos no cubiertos aquí, utilice las herramientas de diagnóstico proporcionadas para recopilar información detallada.