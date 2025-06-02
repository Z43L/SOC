# SOC Inteligente SaaS - Documentación para Desarrolladores

Esta carpeta contiene la documentación completa para desarrolladores del proyecto SOC Inteligente SaaS. Aquí encontrarás explicaciones detalladas de cada componente, arquitectura, variables, funciones y código importante para entender profundamente el funcionamiento del sistema.

## ¿Qué es un SOC (Security Operations Center)?

Un **SOC (Centro de Operaciones de Seguridad)** es un equipo centralizado que monitorea, detecta, analiza y responde a incidentes de ciberseguridad las 24 horas del día. Nuestro SOC Inteligente SaaS automatiza muchas de estas tareas utilizando:

- **Inteligencia Artificial**: Para detectar patrones anómalos y amenazas
- **Automatización**: Para responder rápidamente a incidentes comunes
- **Análisis en Tiempo Real**: Para monitoreo continuo de la seguridad
- **Integración Multiplataforma**: Para recopilar datos de múltiples fuentes

## Tecnologías Principales Utilizadas

### Frontend (Interfaz de Usuario)
- **React 18**: Biblioteca de JavaScript para construir interfaces de usuario interactivas
- **TypeScript**: Superset de JavaScript que añade tipos estáticos para mayor seguridad
- **Vite**: Herramienta de construcción rápida para desarrollo web moderno
- **Tailwind CSS**: Framework de CSS para diseño rápido y consistente
- **Tanstack Query**: Librería para manejo de estado del servidor y cacheo

### Backend (Servidor)
- **Node.js**: Entorno de ejecución de JavaScript en el servidor
- **Express**: Framework web minimalista para Node.js
- **TypeScript**: Para tipado estático en el backend también
- **PostgreSQL**: Base de datos relacional robusta para almacenar datos
- **Drizzle ORM**: Object-Relational Mapping para interactuar con la base de datos

### Agentes (Recolectores de Datos)
- **Binarios Autónomos**: Programas independientes que se instalan en dispositivos
- **Multiplataforma**: Soporte para Windows, Linux y macOS
- **Comunicación Segura**: Conexiones HTTPS/WebSocket encriptadas
- **Auto-actualización**: Capacidad de actualizarse automáticamente

## Estructura de Documentación

### 📁 Arquitectura General
- [`architecture/`](./architecture/) - Documentación de la arquitectura general del sistema
  - [`overview.md`](./architecture/overview.md) - Visión general del sistema
  - [`data-flow.md`](./architecture/data-flow.md) - Flujo de datos en el sistema
  - [`security-model.md`](./architecture/security-model.md) - Modelo de seguridad

### 🔧 Componentes Principales
- [`agents/`](./agents/) - Documentación del sistema de agentes
- [`client/`](./client/) - Documentación del frontend (React/TypeScript)
- [`server/`](./server/) - Documentación del backend (Node.js/TypeScript)
- [`shared/`](./shared/) - Documentación de componentes compartidos
- [`database/`](./database/) - Documentación de esquemas y migraciones

### 🚀 Configuración y Despliegue
- [`deployment/`](./deployment/) - Guías de despliegue y configuración
- [`development/`](./development/) - Guías para desarrolladores
- [`troubleshooting.md`](./troubleshooting.md) - **Solución de problemas comunes** 🔧

### 📚 Guías de Referencia
- [`api/`](./api/) - Documentación de APIs
- [`interfaces/`](./interfaces/) - Documentación de interfaces y tipos
- [`integrations/`](./integrations/) - Documentación de integraciones externas
- [`beginner-guide.md`](./beginner-guide.md) - **Guía completa para principiantes** 🔰

## Propósito de esta Documentación

Esta documentación está diseñada para:

1. **Comprensión Profunda**: Explicar cómo funciona cada parte del código, línea por línea
2. **Desarrollo Continuo**: Facilitar el desarrollo y mantenimiento futuro
3. **Onboarding**: Ayudar a nuevos desarrolladores a entender el sistema desde cero
4. **Referencia Técnica**: Servir como referencia para variables, funciones y patrones
5. **Aprendizaje**: Enseñar conceptos de programación y arquitectura a principiantes

## Cómo Leer Esta Documentación (Para Principiantes)

Si eres nuevo en programación o en estas tecnologías, te recomendamos:

### 1. Conceptos Básicos
Antes de empezar, es útil entender estos conceptos:

- **Variable**: Un contenedor que almacena datos (como una caja con una etiqueta)
- **Función**: Un bloque de código que realiza una tarea específica (como una receta)
- **Clase**: Un molde o plantilla para crear objetos con características similares
- **API**: Interfaz que permite que diferentes programas se comuniquen entre sí
- **Base de Datos**: Sistema para almacenar y organizar información de manera estructurada

### 2. Tipos de Archivos
En este proyecto encontrarás:

- **`.ts` y `.tsx`**: Archivos TypeScript (JavaScript con tipos)
- **`.md`**: Archivos Markdown para documentación (como este)
- **`.json`**: Archivos de configuración con formato estructurado
- **`.sql`**: Archivos con comandos para la base de datos

### 3. Estructura de Explicaciones
Cada explicación de código sigue este formato:
```typescript
// Código de ejemplo
const nombreVariable = "valor";
```
**Explicación detallada**: Qué hace cada parte del código y por qué es importante.

## Convenciones de Documentación

- **Variables**: Se documentan con sus tipos, propósitos, valores posibles y ejemplos de uso
- **Funciones**: Se documentan con parámetros, valores de retorno, efectos secundarios y casos de uso
- **Clases**: Se documentan con sus responsabilidades, dependencias, ciclo de vida y ejemplos prácticos
- **Módulos**: Se documentan con su propósito, dependencias, exportaciones y flujo de datos
- **Configuración**: Se documenta con ejemplos, valores por defecto y explicaciones paso a paso

## Cómo Usar Esta Documentación

### Para Principiantes Absolutos
1. **Comienza aquí**: Lee esta introducción completa
2. **Entiende la arquitectura**: Ve a [`architecture/overview.md`](./architecture/overview.md)
3. **Configura tu entorno**: Sigue [`development/setup.md`](./development/setup.md) paso a paso
4. **Explora componentes**: Comienza con documentación básica de cada componente

### Para Desarrolladores con Experiencia
1. **Visión general rápida**: [`architecture/overview.md`](./architecture/overview.md)
2. **Configuración**: [`development/setup.md`](./development/setup.md)
3. **Componente específico**: Ve directamente a la carpeta del componente que te interesa
4. **API**: Consulta [`api/`](./api/) para endpoints y contratos

### Para Trabajar en Funcionalidades Específicas
- **Sistema de Agentes**: [`agents/`](./agents/) - Recolección de datos en endpoints
- **Frontend**: [`client/`](./client/) - Interfaz de usuario y experiencia
- **Backend**: [`server/`](./server/) - Lógica de servidor y APIs
- **Base de Datos**: [`database/`](./database/) - Esquemas y migraciones
- **Despliegue**: [`deployment/`](./deployment/) - Configuración de producción

## Glosario de Términos Técnicos

### Desarrollo Web
- **Frontend**: La parte visual que ven los usuarios (interfaz de usuario)
- **Backend**: La parte del servidor que procesa la lógica y datos
- **API**: Punto de conexión que permite comunicación entre sistemas
- **REST**: Estilo de arquitectura para APIs web
- **HTTP**: Protocolo de comunicación web
- **HTTPS**: Versión segura y encriptada de HTTP

### Base de Datos
- **ORM**: Herramienta que permite trabajar con base de datos usando código
- **Migración**: Script que modifica la estructura de la base de datos
- **Query**: Consulta para obtener datos de la base de datos
- **Schema**: Estructura que define cómo se organizan los datos

### Seguridad
- **Endpoint**: Dispositivo conectado a la red (computadora, servidor, etc.)
- **Agent**: Programa que recolecta datos de seguridad en un endpoint
- **Event**: Suceso o actividad registrada por el sistema
- **Alert**: Notificación de un evento potencialmente peligroso
- **Incident**: Conjunto de eventos relacionados que requieren investigación

### Programación
- **TypeScript**: JavaScript con tipos estáticos para mayor seguridad
- **Async/Await**: Manera de manejar operaciones que toman tiempo
- **Promise**: Objeto que representa una operación que se completará en el futuro
- **Module**: Archivo que exporta funcionalidades para usar en otros archivos

## Mantenimiento de la Documentación

Esta documentación debe actualizarse cuando:
- Se añaden nuevas funcionalidades
- Se modifican interfaces existentes
- Se cambian patrones de diseño
- Se actualizan dependencias importantes

---

**Nota**: Esta documentación complementa el README.md principal del proyecto y se enfoca específicamente en detalles técnicos para desarrolladores.