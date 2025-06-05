# Índice de Documentación de Agentes SOC-Inteligente

## Descripción General

Este directorio contiene la documentación completa del sistema de agentes del SOC-Inteligente. Los agentes son componentes críticos que recopilan datos de seguridad directamente desde los endpoints y los envían al servidor central para análisis.

## Documentos Disponibles

### 📋 [Visión General del Sistema](overview.md)
**Propósito:** Introducción general al sistema de agentes
- Arquitectura del sistema
- Flujo de ejecución detallado para principiantes
- Componentes principales
- Sistema de colectores
- Características de seguridad
- Comandos remotos y auto-actualización

### 🔧 [Referencia de API](api-reference.md)
**Propósito:** Documentación técnica completa de todas las clases, métodos e interfaces
- Clase AgentBase y métodos principales
- Sistema de comunicación con el servidor
- Configuración del agente (interfaces y funciones)
- Sistema de colectores y eventos
- Sistema de cola de eventos
- Sistema de logging
- Ejemplos de código completos

### 📦 [Guía de Instalación y Despliegue](installation-guide.md)
**Propósito:** Instrucciones paso a paso para instalar agentes en todas las plataformas
- Requisitos del sistema
- Instalación en Windows (MSI e instalación manual)
- Instalación en Linux (DEB, RPM e instalación manual)
- Instalación en macOS (PKG e instalación manual)
- Configuración inicial y de red
- Configuración como servicio
- Verificación y desinstalación

### 🛠️ [Desarrollo de Colectores Personalizados](custom-collectors-guide.md)
**Propósito:** Guía completa para desarrollar colectores especializados
- Arquitectura y interfaces de colectores
- Desarrollo paso a paso
- Ejemplos prácticos (Monitor de BD, Servidor Web, Aplicaciones)
- Mejores prácticas de desarrollo
- Testing y debugging
- Distribución e integración

### 🔍 [Guía de Resolución de Problemas](troubleshooting-guide.md)
**Propósito:** Diagnóstico y solución de problemas comunes
- Problemas de conexión y certificados SSL
- Problemas de registro de agentes
- Problemas de rendimiento (CPU, memoria, disco)
- Problemas de configuración y permisos
- Problemas de servicios y colectores
- Herramientas de diagnóstico automático
- Scripts de monitoreo y análisis de logs

### ⚙️ [Ejemplos de Configuración y Uso](configuration-examples.md)
**Propósito:** Configuraciones prácticas para diferentes escenarios
- Configuraciones básicas (desarrollo, producción, alto rendimiento)
- Configuraciones por entorno (corporativo, Linux, macOS)
- Configuraciones especializadas (BD, AD, servidores web)
- Ejemplos de despliegue masivo (PowerShell, Ansible)
- Scripts de automatización y mantenimiento
- Sistemas de monitoreo y alertas

## Estructura de Archivos

```
docu/agents/
├── README.md                      # Este archivo - Índice principal
├── overview.md                    # Visión general del sistema
├── api-reference.md              # Referencia completa de API
├── installation-guide.md         # Guía de instalación y despliegue
├── custom-collectors-guide.md    # Desarrollo de colectores personalizados
├── troubleshooting-guide.md      # Resolución de problemas
└── configuration-examples.md     # Ejemplos de configuración y uso
```

## Audiencia Objetivo

### 👨‍💼 Administradores de Sistemas
- **Documentos recomendados:** Installation Guide, Configuration Examples, Troubleshooting Guide
- **Enfoque:** Despliegue, configuración y mantenimiento de agentes

### 👨‍💻 Desarrolladores
- **Documentos recomendados:** API Reference, Custom Collectors Guide, Overview
- **Enfoque:** Integración, desarrollo de colectores personalizados y extensión del sistema

### 🏢 Equipos de Seguridad (SOC)
- **Documentos recomendados:** Overview, Configuration Examples, Troubleshooting Guide
- **Enfoque:** Configuración de monitoreo y respuesta a incidentes

### 📚 Principiantes
- **Documentos recomendados:** Overview (especialmente la sección para principiantes), Installation Guide
- **Enfoque:** Comprensión del sistema y primeros pasos

## Cómo Usar Esta Documentación

### Para Instalación Inicial

1. **Comenzar con:** [Installation Guide](installation-guide.md)
2. **Continuar con:** [Configuration Examples](configuration-examples.md) (configuraciones básicas)
3. **Si hay problemas:** [Troubleshooting Guide](troubleshooting-guide.md)

### Para Desarrollo

1. **Comenzar con:** [Overview](overview.md) para entender la arquitectura
2. **Continuar con:** [API Reference](api-reference.md) para detalles técnicos
3. **Para colectores personalizados:** [Custom Collectors Guide](custom-collectors-guide.md)

### Para Resolución de Problemas

1. **Identificar el problema:** [Troubleshooting Guide](troubleshooting-guide.md)
2. **Revisar configuración:** [Configuration Examples](configuration-examples.md)
3. **Consultar API:** [API Reference](api-reference.md) si es necesario

### Para Despliegue Empresarial

1. **Planificación:** [Overview](overview.md) + [Configuration Examples](configuration-examples.md)
2. **Implementación:** [Installation Guide](installation-guide.md)
3. **Automatización:** Scripts en [Configuration Examples](configuration-examples.md)
4. **Monitoreo:** [Troubleshooting Guide](troubleshooting-guide.md) (scripts de monitoreo)

## Convenciones de Documentación

### Código y Comandos
- **Bloques de código:** Siempre incluyen el lenguaje/shell específico
- **Ejemplos de configuración:** En formato JSON con comentarios explicativos
- **Scripts:** Incluyen manejo de errores y logging

### Niveles de Complejidad
- **🟢 Básico:** Conceptos fundamentales y configuraciones simples
- **🟡 Intermedio:** Configuraciones avanzadas y personalización
- **🔴 Avanzado:** Desarrollo de extensiones y resolución de problemas complejos

### Plataformas
- **🖥️ Windows:** Ejemplos específicos para Windows
- **🐧 Linux:** Ejemplos específicos para Linux
- **🍎 macOS:** Ejemplos específicos para macOS
- **🌐 Multiplataforma:** Ejemplos que funcionan en todas las plataformas

## Actualizaciones y Versiones

Esta documentación está sincronizada con la versión del sistema de agentes. Para verificar compatibilidad:

```bash
# Verificar versión del agente
/opt/soc-agent/bin/soc-agent --version

# Verificar documentación más reciente
curl -s https://raw.githubusercontent.com/empresa/soc-docs/main/agents/VERSION
```

## Contribuciones

Para contribuir a esta documentación:

1. **Reportar errores:** Crear issue en el repositorio
2. **Sugerir mejoras:** Pull request con cambios propuestos
3. **Añadir ejemplos:** Seguir el formato establecido en cada documento

## Enlaces Relacionados

- **[Documentación del Servidor](../server/):** Configuración del servidor SOC
- **[API REST](../api/):** Documentación de la API del servidor
- **[Arquitectura General](../architecture/):** Visión general del sistema completo
- **[Guía de Desarrollo](../development/):** Configuración del entorno de desarrollo

## Soporte

Para soporte técnico:
- **Documentación:** Consultar esta documentación
- **Issues:** Reportar en el repositorio del proyecto
- **Contacto:** equipo-soc@empresa.com

---

*Última actualización: $(date +'%Y-%m-%d')*