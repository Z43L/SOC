# Agentes de SOC-Inteligente

Este directorio contiene el código fuente para los agentes de recolección de datos del SOC-Inteligente. Los agentes ahora utilizan una **arquitectura Electron** que proporciona aplicaciones nativas multiplataforma con configuración embebida.

## Estado Actual ✅

**Arquitectura Electron implementada:**

- ✅ **Electron Application**: Aplicación nativa multiplataforma
- ✅ **Embedded Configuration**: Configuración embebida en el ejecutable 
- ✅ **Pre-compiled Executables**: Ejecutables pre-compilados para descarga
- ✅ **Cross-platform Support**: Windows (.exe), Linux (AppImage), macOS (.dmg)
- ✅ **Background Operation**: Funcionamiento en segundo plano
- ✅ **Simple UI**: Interfaz básica para monitoreo de estado
- ✅ **Core Modules**: Logger, Transport, Metrics, Queue, Heartbeat
- ✅ **Collectors**: Linux (5), Windows (4), macOS
- ✅ **Communication**: Registro, envío de eventos, heartbeat
- ✅ **Command System**: Ejecución remota de comandos
- ✅ **Build System**: Electron Builder para todas las plataformas

**Compilación verificada:**
- TypeScript: ✅ Sin errores
- Electron Build: ✅ Funcional para Linux x64/ARM64
- Configuración: ✅ Embebida correctamente
- Dependencias: ✅ Resueltas

## Arquitectura Electron

La nueva arquitectura basada en Electron proporciona:
- **Aplicaciones Nativas**: Ejecutables nativos para cada plataforma
- **Configuración Embebida**: No requiere archivos de configuración externos
- **UI de Estado**: Interfaz simple para monitoreo (puede ocultarse)
- **Operación en Background**: Funciona como servicio del sistema
- **Pre-compilado**: Los agentes se compilan en el servidor antes de la descarga
- **Cross-platform**: Un solo código base para todas las plataformas

## Estructura del Proyecto

```
agents/
├── collectors/             # Sistema de colectores modulares
│   ├── types.ts           # Interfaces y tipos compartidos
│   ├── index.ts           # Gestión dinámica de colectores
│   ├── linux/             # Colectores específicos para Linux
│   ├── macos/             # Colectores específicos para macOS  
│   └── windows/           # Colectores específicos para Windows
├── core/                  # Funcionalidad central
│   ├── agent-config.ts    # Gestión de configuración con validaciones
│   ├── logger.ts          # Sistema de logging centralizado
│   ├── transport.ts       # Transporte seguro con validación SSL
│   ├── queue.ts           # Cola persistente de eventos
│   ├── metrics.ts         # Recolección de métricas
│   └── heartbeat.ts       # Gestión de heartbeats
├── commands/              # Ejecutor de comandos push
├── updater/               # Sistema de actualizaciones
├── main.ts                # Punto de entrada principal con CLI
└── main-simple.ts         # Versión simplificada para testing
```

## Mejoras de Seguridad

- **Validación de integridad**: Verificación SHA256 del binario del agente
- **Validación SSL/TLS**: Verificación estricta de certificados del servidor
- **Encriptación de configuración**: Valores sensibles encriptados en configuración
- **Límites de mensaje**: Validación de tamaño máximo de mensajes (1MB)
- **Timeouts**: Timeouts de conexión configurables

## Configuración

### Argumentos de Línea de Comandos

```bash
soc-agent [opciones]

Opciones:
  -c, --config <path>      Ruta al archivo de configuración
  -l, --log-level <level>  Nivel de logging (debug, info, warn, error)
  -h, --help              Mostrar ayuda
  -v, --version           Mostrar versión
```

### Variables de Entorno

```bash
AGENT_CONFIG_PATH       # Ruta al archivo de configuración
AGENT_LOG_LEVEL        # Nivel de logging
AGENT_SERVER_URL       # URL del servidor
AGENT_ORG_KEY          # Clave de organización
AGENT_VALIDATE_CERTS   # Validar certificados SSL (true/false)
AGENT_TRANSPORT        # Tipo de transporte (https/websocket)
```

## Colectores Disponibles

### Linux
- **process**: Monitoreo de procesos con detección de actividad sospechosa
- **network**: Conexiones de red y patrones anómalos
- **filesystem**: Cambios en archivos críticos usando inotify
- **journald**: Logs del sistema desde journald
- **module**: Carga/descarga de módulos del kernel

### Windows
- **event-log**: Eventos de seguridad del registro de Windows (mejorado con validación y manejo robusto de errores)
- **process**: Monitoreo de procesos con detección de actividad sospechosa usando tasklist y WMI
- **registry**: Monitoreo de cambios críticos en el registro del sistema
- **services**: Monitoreo de servicios de Windows para detectar cambios de estado

### macOS
- **basic**: Colector básico (expandible según necesidades)

## Desarrollo

### Compilación

#### Construcción de TypeScript
```bash
cd agents/
npm install
npm run build:electron
```

#### Empaquetado Electron

```bash
# Empaquetar para todas las plataformas (requiere dependencias específicas)
npm run package:all

# Empaquetado individual por plataforma
npm run package:linux    # Linux x64 + ARM64 (AppImage)
npm run package:windows  # Windows x64 (Portable .exe)
npm run package:macos    # macOS x64 + ARM64 (.dmg)
```

### Archivos de Salida

El proceso de construcción Electron genera:

- **Linux**: `soc-agent-linux-x86_64.AppImage`, `soc-agent-linux-arm64.AppImage`
- **Windows**: `soc-agent-windows-x64.exe` (portable)
- **macOS**: `soc-agent-macos-x64.dmg`, `soc-agent-macos-arm64.dmg`

### Configuración Embebida

Los agentes Electron incluyen la configuración embebida en el ejecutable:
- Configuración se incluye en `resources/agent-config.json`
- No requiere archivos de configuración externos
- Se genera automáticamente durante el proceso de compilación en el servidor

### Testing Local

```bash
# Verificar compilación TypeScript
npm run compile-check

# Construir y ejecutar localmente (con configuración de prueba)
npm run build:electron
./dist/soc-agent-linux-x86_64.AppImage  # En Linux
```

### Agent Config (agent-config.ts)

Gestiona la configuración del agente:
- Carga/guardado de configuración desde/a archivo YAML
- Valores predeterminados
- Capacidades configurables

### Communication (communication.ts)

Gestiona todas las comunicaciones con el servidor SOC:
- Registro del agente
- Envío de eventos
- Heartbeats periódicos
- Autenticación y firmado de mensajes

### Monitoring (monitoring.ts)

Define interfaces comunes y utilidades para el monitoreo:
- Tipos de eventos y métricas
- Funciones de ayuda para crear eventos a partir de hallazgos

## Capacidades

Los agentes pueden configurarse para monitorear:

- **Sistema de archivos**: Detecta cambios en archivos sensibles
- **Procesos**: Monitorea procesos en ejecución y detecta procesos sospechosos
- **Red**: Supervisa conexiones y detecta patrones sospechosos
- **Registro** (sólo Windows): Monitorea cambios en el registro de Windows
- **Logs de seguridad**: Analiza logs del sistema para eventos de seguridad
- **Malware**: Escanea archivos en busca de malware
- **Vulnerabilidades**: Detecta software vulnerable instalado

## Implementaciones Específicas por Plataforma

### Windows (windows-agent.ts)

Implementación completa para sistemas Windows que utiliza:

**Colectores de Windows:**
- **Event Log**: Monitoreo completo del Registro de Eventos de Windows (Security, System, Application, PowerShell)
- **Process**: Monitoreo de procesos con detección de actividad sospechosa usando tasklist y WMI
- **Registry**: Monitoreo de cambios críticos en el registro del sistema
- **Services**: Monitoreo de servicios de Windows para detectar cambios de estado

**Características de seguridad mejoradas:**
- Eliminación de instalación dinámica de paquetes durante la ejecución (vulnerabilidad de seguridad corregida)
- Validación exhaustiva de datos de entrada y salida
- Manejo robusto de errores y recuperación automática
- Filtrado inteligente de eventos críticos de seguridad
- Timeouts configurables para comandos del sistema

**Capacidades específicas de Windows:**
- Integración con WMI (Windows Management Instrumentation)
- Soporte para comandos nativos de Windows (tasklist, reg, sc, wmic)
- Detección de procesos sospechosos y ubicaciones peligrosas
- Monitoreo de servicios críticos del sistema
- Análisis de cambios en claves críticas del registro

### Linux (linux-agent.ts)

Implementación para sistemas Linux que utiliza herramientas nativas:
- Monitoreo de procesos con `/proc`
- Monitoreo de archivos con inotify
- Monitoreo de red con netstat/ss
- Análisis de logs del sistema

## Uso

Cada agente debe inicializarse con una ruta a un archivo de configuración:

```typescript
import { LinuxAgent } from './linux/linux-agent';

async function main() {
  // Crear e inicializar el agente
  const agent = new LinuxAgent('/etc/soc-agent/config.yaml');
  await agent.initialize();
  
  // Iniciar monitoreo
  await agent.start();
  
  // Manejar señales de terminación
  process.on('SIGINT', async () => {
    console.log('Stopping agent...');
    await agent.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

## Seguridad

Los agentes implementan varias medidas de seguridad:
- Autenticación con el servidor mediante tokens JWT
- Firmado opcional de mensajes con criptografía asimétrica
- Comunicación cifrada mediante TLS/HTTPS
- Validación de certificados del servidor

## Desarrollo Futuro

- ✅ **Implementación para Windows** - Completada con colectores completos y características de seguridad mejoradas
- Implementación para macOS
- Soporte para agentes sin sistema operatorio (dispositivos IoT)
- Análisis de tráfico profundo mediante captura de paquetes
- Análisis de memoria para detección avanzada de malware