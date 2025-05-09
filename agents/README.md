# Agentes de SOC-Inteligente

Este directorio contiene el código fuente para los agentes de recolección de datos del SOC-Inteligente. Estos agentes están diseñados para ser instalados en sistemas cliente para recopilar información de seguridad y enviarla al servidor central.

## Estructura del Proyecto

```
agents/
├── common/               # Código común para todos los agentes
│   ├── agent-base.ts     # Clase base abstracta para todas las implementaciones
│   ├── agent-config.ts   # Gestión de configuración
│   ├── communication.ts  # Comunicación con el servidor SOC
│   └── monitoring.ts     # Interfaces y utilidades para monitoreo
├── linux/                # Implementación específica para Linux
│   ├── index.ts          # Punto de entrada para el agente Linux
│   └── linux-agent.ts    # Implementación de agente para Linux
├── windows/              # Implementación específica para Windows (pendiente)
└── README.md             # Este archivo
```

## Módulos Principales

### Agent Base (agent-base.ts)

Proporciona una clase abstracta con la lógica común de todos los agentes:
- Inicialización y registro con el servidor
- Programación de tareas periódicas (heartbeat, envío de datos, escaneos)
- Gestión de cola de eventos
- Comunicación con el servidor

### Agent Config (agent-config.ts)

Gestiona la configuración del agente:
- Carga/guardado de configuración desde/a archivo
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
  const agent = new LinuxAgent('/etc/soc-agent/config.json');
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

- Implementación para Windows
- Implementación para macOS
- Soporte para agentes sin sistema operativo (dispositivos IoT)
- Análisis de tráfico profundo mediante captura de paquetes
- Análisis de memoria para detección avanzada de malware