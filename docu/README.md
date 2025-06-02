# SOC Inteligente SaaS - Documentación para Desarrolladores

Esta carpeta contiene la documentación completa para desarrolladores del proyecto SOC Inteligente SaaS. Aquí encontrarás explicaciones detalladas de cada componente, arquitectura, variables, funciones y código importante para entender profundamente el funcionamiento del sistema.

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

### 📚 Guías de Referencia
- [`api/`](./api/) - Documentación de APIs
- [`interfaces/`](./interfaces/) - Documentación de interfaces y tipos
- [`integrations/`](./integrations/) - Documentación de integraciones externas

## Propósito de esta Documentación

Esta documentación está diseñada para:

1. **Comprensión Profunda**: Explicar cómo funciona cada parte del código
2. **Desarrollo Continuo**: Facilitar el desarrollo y mantenimiento futuro
3. **Onboarding**: Ayudar a nuevos desarrolladores a entender el sistema
4. **Referencia Técnica**: Servir como referencia para variables, funciones y patrones

## Convenciones de Documentación

- **Variables**: Se documentan con sus tipos, propósitos y valores posibles
- **Funciones**: Se documentan con parámetros, valores de retorno y efectos secundarios
- **Clases**: Se documentan con sus responsabilidades, dependencias y ciclo de vida
- **Módulos**: Se documentan con su propósito, dependencias y exportaciones
- **Configuración**: Se documenta con ejemplos y valores por defecto

## Cómo Usar Esta Documentación

1. **Para entender el sistema**: Comienza con [`architecture/overview.md`](./architecture/overview.md)
2. **Para trabajar en una funcionalidad específica**: Ve al componente correspondiente
3. **Para configurar el entorno**: Consulta [`development/setup.md`](./development/setup.md)
4. **Para desplegar**: Consulta [`deployment/`](./deployment/)

## Mantenimiento de la Documentación

Esta documentación debe actualizarse cuando:
- Se añaden nuevas funcionalidades
- Se modifican interfaces existentes
- Se cambian patrones de diseño
- Se actualizan dependencias importantes

---

**Nota**: Esta documentación complementa el README.md principal del proyecto y se enfoca específicamente en detalles técnicos para desarrolladores.