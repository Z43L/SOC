# Documentación Completa del Sistema de Agentes SOC

## Índice de Documentación

Esta es la documentación completa y detallada del sistema de agentes SOC Inteligente. La documentación está organizada por temas para facilitar la navegación.

### 📋 Documentación Principal

#### [1. Visión General del Sistema](./overview.md)
**Descripción completa de la arquitectura y funcionamiento**
- Arquitectura modular del sistema
- Documentación detallada por archivo
- Módulos core (agent-config, logger, transport, queue, metrics, heartbeat)
- Sistema de colectores multiplataforma
- Comandos remotos y auto-actualización
- Flujo de ejecución paso a paso
- Ejemplos de código reales

#### [2. Compilación y Despliegue](./build-and-deployment.md)
**Guía completa de build y distribución**
- Configuración del entorno de desarrollo
- Scripts de compilación para cada plataforma
- Empaquetado con PKG para binarios standalone
- Configuración específica por sistema operativo
- Pipeline CI/CD con GitHub Actions
- Distribución automática desde el servidor
- Optimización y troubleshooting de builds

#### [3. Referencia de Configuración](./configuration-reference.md)
**Documentación exhaustiva de todas las opciones**
- Estructura completa del archivo de configuración
- Variables de entorno disponibles
- Configuraciones específicas por plataforma (Windows, Linux, macOS)
- Perfiles de configuración (desarrollo, producción, alto rendimiento)
- Configuración dinámica via comandos remotos
- Validación y encriptación de configuración
- Ejemplos prácticos para cada escenario

#### [4. Guía de Resolución de Problemas](./troubleshooting.md)
**Soluciones para problemas comunes**
- Diagnóstico inicial y herramientas
- Problemas de instalación y permisos
- Issues de conectividad y certificados SSL
- Problemas de rendimiento (CPU, memoria, I/O)
- Troubleshooting de colectores específicos
- Problemas con comandos remotos y actualizaciones
- Scripts de monitoreo y health checks
- Recolección de información de diagnóstico

#### [5. Referencia de APIs](./api-reference.md)
**APIs completas internas y del servidor**
- APIs internas del agente (Core, Collectors, Events)
- APIs del servidor para gestión de agentes
- Interfaces TypeScript completas
- Ejemplos de uso para cada API
- SDKs disponibles (JavaScript/TypeScript, Python)
- Webhooks y streaming de eventos
- Autenticación y rate limits

### 🎯 Guías por Rol

#### Para Desarrolladores
1. **Empezar aquí**: [Visión General](./overview.md) → [API Reference](./api-reference.md)
2. **Desarrollo**: [Build Guide](./build-and-deployment.md) 
3. **Testing**: [Configuration Reference](./configuration-reference.md) → [Troubleshooting](./troubleshooting.md)

#### Para Administradores de Sistema
1. **Empezar aquí**: [Configuration Reference](./configuration-reference.md)
2. **Despliegue**: [Build and Deployment](./build-and-deployment.md)
3. **Mantenimiento**: [Troubleshooting](./troubleshooting.md)

#### Para Analistas de Seguridad
1. **Empezar aquí**: [Visión General](./overview.md) (Sección "Sistema de Colectores")
2. **Configuración**: [Configuration Reference](./configuration-reference.md) (Sección "Colectores")
3. **APIs**: [API Reference](./api-reference.md) (Sección "Event System")

### 🔧 Guías por Plataforma

#### Windows
- [Overview → Colectores Windows](./overview.md#colectores-windows---documentación-específica)
- [Configuration → Windows](./configuration-reference.md#windows)
- [Build → Windows](./build-and-deployment.md#windows)
- [Troubleshooting → Windows Issues](./troubleshooting.md#problemas-específicos-de-windows)

#### Linux
- [Overview → Colectores Linux](./overview.md#colectores-linux---documentación-específica)
- [Configuration → Linux](./configuration-reference.md#linux)
- [Build → Linux](./build-and-deployment.md#linux)
- [Troubleshooting → Linux Issues](./troubleshooting.md#problemas-específicos-de-linux)

#### macOS
- [Overview → Sistema macOS](./overview.md#colectores-macos)
- [Configuration → macOS](./configuration-reference.md#macos)
- [Build → macOS](./build-and-deployment.md#macos)

### 📚 Temas Específicos

#### Seguridad
- [Overview → Seguridad del Agente](./overview.md#seguridad-del-agente)
- [Configuration → Configuración de Seguridad](./configuration-reference.md#configuración-de-seguridad-avanzada)
- [API → Autenticación](./api-reference.md#rate-limits-y-autenticación)

#### Performance y Monitoreo
- [Overview → Métricas](./overview.md#5-coremetricts---recolección-de-métricas)
- [Configuration → Perfiles de Alto Rendimiento](./configuration-reference.md#perfil-de-alto-rendimiento)
- [Troubleshooting → Problemas de Rendimiento](./troubleshooting.md#problemas-de-rendimiento)

#### Automatización y CI/CD
- [Build → CI/CD Pipeline](./build-and-deployment.md#cicd-pipeline)
- [Configuration → Configuración Dinámica](./configuration-reference.md#configuración-dinámica)
- [API → Agent Management](./api-reference.md#agent-management-api)

## 🚀 Inicio Rápido

### Para Nuevos Desarrolladores

1. **Entender el Sistema** (15 min)
   - Lee [Overview → Arquitectura](./overview.md#arquitectura-del-sistema-de-agentes)
   - Revisa [Overview → Flujo de Ejecución](./overview.md#flujo-de-ejecución-del-agente)

2. **Configurar el Entorno** (30 min)
   - Sigue [Build → Instalación de Dependencias](./build-and-deployment.md#requisitos-previos)
   - Ejecuta el primer build: [Build → Compilación Simple](./build-and-deployment.md#compilación-simple-para-testing)

3. **Primer Test** (15 min)
   - Usa [Configuration → Perfil de Desarrollo](./configuration-reference.md#perfil-de-desarrollo)
   - Ejecuta diagnóstico: [Troubleshooting → Diagnóstico Inicial](./troubleshooting.md#diagnóstico-inicial)

### Para Administradores

1. **Entender la Configuración** (20 min)
   - Lee [Configuration → Estructura Básica](./configuration-reference.md#estructura-básica)
   - Revisa [Configuration → Variables de Entorno](./configuration-reference.md#variables-de-entorno)

2. **Desplegar en Producción** (45 min)
   - Sigue [Build → Empaquetado](./build-and-deployment.md#empaquetado-de-binarios)
   - Usa [Configuration → Perfil de Producción](./configuration-reference.md#perfil-de-producción)

3. **Configurar Monitoreo** (30 min)
   - Implementa [Troubleshooting → Herramientas de Monitoreo](./troubleshooting.md#herramientas-de-monitoreo)
   - Configura [Configuration → Auditoría](./configuration-reference.md#configuración-de-auditoría)

## 🔍 Búsqueda Rápida de Información

### Problemas Comunes
- **El agente no inicia**: [Troubleshooting → Problemas de Instalación](./troubleshooting.md#problemas-de-instalación)
- **No se conecta al servidor**: [Troubleshooting → Problemas de Conexión](./troubleshooting.md#problemas-de-conexión)
- **Alto uso de CPU/memoria**: [Troubleshooting → Problemas de Rendimiento](./troubleshooting.md#problemas-de-rendimiento)
- **Colector no funciona**: [Troubleshooting → Problemas de Colectores](./troubleshooting.md#problemas-de-colectores)

### Configuraciones Específicas
- **Configurar colectores**: [Configuration → Colectores](./configuration-reference.md#configuración-específica-de-colectores)
- **Comandos remotos**: [Configuration → Comandos](./configuration-reference.md#comandos-remotos)
- **Auto-actualización**: [Configuration → Auto-actualización](./configuration-reference.md#auto-actualización)
- **Logging avanzado**: [Configuration → Logs](./configuration-reference.md#configuración-de-logs)

### APIs y Desarrollo
- **Event API**: [API → Event System](./api-reference.md#event-system-api)
- **Collector API**: [API → Collectors](./api-reference.md#collectors-api)
- **Transport API**: [API → Transport](./api-reference.md#transport-api)
- **Gestión de agentes**: [API → Agent Management](./api-reference.md#agent-management-api)

### Códigos de Ejemplo
- **Configuración básica**: [Configuration → Estructura Básica](./configuration-reference.md#estructura-básica)
- **Colector personalizado**: [API → Ejemplo de Colector](./api-reference.md#ejemplo-de-uso-2)
- **Comando de configuración**: [Configuration → API de Configuración](./configuration-reference.md#api-de-configuración)
- **Script de build**: [Build → Scripts](./build-and-deployment.md#scripts-de-build)

## 📖 Convenciones de la Documentación

### Formato de Código
- **TypeScript**: Interfaces y clases principales
- **YAML**: Archivos de configuración
- **Bash/PowerShell**: Scripts de instalación y administración
- **JavaScript/Python**: Ejemplos de SDK

### Íconos y Convenciones
- ✅ **Funcionalidad confirmada y testada**
- ⚠️ **Advertencias importantes**
- 🔧 **Configuración requerida**
- 💡 **Tips y mejores prácticas**
- 🐛 **Problemas conocidos**
- 📝 **Notas adicionales**

### Niveles de Detalle
- **Básico**: Conceptos fundamentales y ejemplos simples
- **Intermedio**: Configuraciones específicas y casos de uso
- **Avanzado**: APIs completas y personalización profunda

## 🤝 Contribuir a la Documentación

### Reportar Problemas
- Usa los scripts de diagnóstico de [Troubleshooting](./troubleshooting.md)
- Incluye versión del agente, SO, y configuración
- Proporciona logs relevantes

### Solicitar Mejoras
- Especifica caso de uso y justificación
- Propone ejemplos concretos
- Considera impacto en diferentes plataformas

### Actualizar Documentación
- Mantén consistencia con ejemplos existentes
- Incluye código funcional y testado
- Actualiza índices y referencias cruzadas

## 📋 Lista de Verificación para Implementación

### Para Desarrollo
- [ ] Leer [Overview](./overview.md) completo
- [ ] Configurar entorno según [Build Guide](./build-and-deployment.md)
- [ ] Probar build simple y avanzado
- [ ] Revisar [APIs](./api-reference.md) relevantes
- [ ] Implementar colector/funcionalidad de prueba

### Para Producción
- [ ] Definir configuración según [Configuration Reference](./configuration-reference.md)
- [ ] Testear en entorno de desarrollo
- [ ] Configurar monitoreo según [Troubleshooting](./troubleshooting.md)
- [ ] Documentar configuración específica
- [ ] Crear scripts de despliegue
- [ ] Entrenar equipo de soporte

Esta documentación está diseñada para ser una referencia completa y práctica para todos los aspectos del sistema de agentes SOC. Cada sección proporciona tanto conceptos teóricos como ejemplos prácticos listos para usar.