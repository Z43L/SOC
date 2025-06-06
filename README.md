# Documentación del Proyecto SOC Inteligente SaaS

## Introducción

Este proyecto consiste en un Centro de Operaciones de Seguridad (SOC) Inteligente como Servicio (SaaS). Su objetivo principal es proporcionar una plataforma centralizada para el monitoreo de seguridad de dispositivos macOS, Linux y Windows.

Los agentes de monitoreo se pueden generar directamente desde la aplicación para cada sistema operativo compatible. La plataforma integra diversas fuentes de información y herramientas para facilitar la detección, análisis y respuesta a incidentes de seguridad. Entre sus capacidades se incluye la conexión con bases de datos de vulnerabilidades, la integración con servicios como VirusTotal para el análisis de archivos y URLs, y el uso de la API de OpenAI para potenciar las capacidades de análisis y asistencia en el monitoreo.

Este documento tiene como objetivo detallar la arquitectura, componentes y funcionalidades del proyecto para facilitar su comprensión, mantenimiento y desarrollo futuro.

## Estructura General del Proyecto

El proyecto está organizado en varios directorios principales, cada uno con un propósito específico. A continuación, se describe la función de los más relevantes:

*   **`/` (Raíz del proyecto):** Contiene archivos de configuración generales, el `Dockerfile` para la contenerización, `docker-compose.yml` para la orquestación, `package.json` para las dependencias del proyecto Node.js, y archivos de documentación como este mismo.

*   **`agents/`:** Alberga el código fuente de los agentes de monitoreo que se instalan en los dispositivos cliente. Los agentes se empaquetan como binarios autosuficientes usando `pkg` para distribución multiplataforma sin dependencias de Node.js. Incluye capacidades de auto-actualización, telemetría avanzada y verificación de firmas digitales.
    *   *Referencia:* `agents/` - Ver [Documentación de Empaquetado](docs/agent-packaging.md)

*   **`client/`:** Contiene toda la aplicación frontend desarrollada en React (usando TypeScript y Vite). Desde aquí se gestiona la interfaz de usuario con la que interactúan los administradores del SOC.
    *   *Referencia:* `client/`

*   **`migrations/`:** Almacena los scripts de migración de la base de datos. Estos scripts se utilizan para definir y actualizar el esquema de la base de datos de forma versionada, utilizando herramientas como Drizzle ORM.
    *   *Referencia:* `migrations/`

*   **`public/`:** Contiene archivos estáticos que se sirven directamente al cliente, como imágenes, fuentes o archivos de descarga (e.g., los agentes compilados).
    *   *Referencia:* `public/`

*   **`server/`:** Aquí reside el código backend de la aplicación, desarrollado en Node.js con TypeScript. Gestiona la lógica de negocio, las API, la comunicación con la base de datos, y las integraciones con servicios externos.
    *   *Referencia:* `server/`

*   **`shared/`:** Incluye código que es compartido tanto por el `server` como potencialmente por el `client` u otros componentes. Un ejemplo clave es `shared/schema.ts`, que define el esquema de la base de datos y los tipos de datos comunes.
    *   *Referencia:* `shared/schema.ts`

## Componentes del Servidor (`server/`)

El directorio `server/` contiene el corazón de la lógica de backend de la plataforma SOC Inteligente SaaS. Está desarrollado en Node.js utilizando TypeScript, lo que proporciona un tipado estático para un desarrollo más robusto y mantenible. A continuación, se describen sus subcomponentes principales:

### Punto de Entrada y Configuración Principal

*   **`server/index.ts`**: Es el punto de entrada principal de la aplicación backend. Se encarga de inicializar el servidor Express, configurar los middlewares esenciales (como `cors`, `body-parser`), cargar las rutas, establecer la conexión con la base de datos y poner en marcha el servidor para escuchar las peticiones entrantes. También puede incluir la inicialización de otros servicios clave como la cola de procesamiento de IA o el programador de tareas.
    *   *Referencia:* `server/index.ts`

### Gestión de Rutas

La aplicación define varias rutas para manejar las diferentes solicitudes HTTP provenientes del cliente o de los agentes.

*   **`server/routes.ts`**: Este archivo generalmente contiene las rutas principales de la API. Define los endpoints para funcionalidades como la gestión de usuarios, alertas, incidentes, configuración de conectores, etc. Cada ruta se asocia a un controlador específico que maneja la lógica de negocio.
    *   *Referencia:* `server/routes.ts`
*   **`server/advanced-routes.ts`**: Podría contener rutas para funcionalidades más avanzadas o específicas, posiblemente relacionadas con las capacidades de IA, correlación avanzada de eventos, o endpoints para la administración del sistema.
    *   *Referencia:* `server/advanced-routes.ts`

### Autenticación y Autorización

La seguridad y el control de acceso son fundamentales en una plataforma SOC.

*   **`server/auth.ts`**: Este módulo es responsable de gestionar la autenticación de usuarios y, posiblemente, de agentes. Implementa la lógica para verificar credenciales, generar y validar tokens (por ejemplo, JWT), y proteger las rutas que requieren autenticación. También puede integrarse con proveedores de identidad externos si fuera el caso.
    *   *Referencia:* `server/auth.ts`

### Gestión de la Base de Datos

La persistencia de datos es crucial para almacenar información sobre usuarios, organizaciones, agentes, alertas, incidentes, configuraciones, etc.

*   **`server/db.ts`**: Contiene la configuración y la lógica para conectarse a la base de datos. Define la instancia del cliente de la base de datos (por ejemplo, utilizando Drizzle ORM con un driver como `pg` para PostgreSQL) y la exporta para que otros módulos puedan interactuar con la base de datos.
    *   *Referencia:* `server/db.ts`
*   **`server/db-init.ts`**: Podría ser un script o módulo que se encarga de la inicialización de la base de datos, como la creación de tablas si no existen (aunque esto se gestiona más robustamente con migraciones), o la inserción de datos iniciales (seeding) necesarios para el funcionamiento de la aplicación.
    *   *Referencia:* `server/db-init.ts`
*   **`migrations/`**: Como se mencionó anteriormente, este directorio es fundamental para la gestión del esquema de la base de datos. Los archivos SQL o TypeScript en este directorio (por ejemplo, `migrations/0000_schema_initial.sql`) definen los cambios incrementales en la estructura de la base de datos, permitiendo una evolución controlada y versionada. Drizzle Kit se utiliza para generar y aplicar estas migraciones.
    *   *Referencia:* `migrations/`

### Integraciones (`server/integrations/`)

El subdirectorio `server/integrations/` es vital ya que centraliza la lógica para interactuar con diversos servicios internos y externos, así como para implementar funcionalidades complexas.

#### Gestión de Agentes

*   **`server/integrations/agents.ts`**: Este módulo maneja la lógica relacionada con los agentes de monitoreo. Esto puede incluir el registro de nuevos agentes, la gestión de su estado (online/offline), la recepción de datos de los agentes y la comunicación de tareas o configuraciones hacia ellos.
    *   *Referencia:* `server/integrations/agents.ts`
*   **`server/integrations/agent-builder.ts`**: Dada la mención en el `README.md` de que los agentes se generan desde la aplicación, este archivo probablemente contiene la lógica para compilar o empaquetar los agentes para los diferentes sistemas operativos (Linux, macOS, Windows) bajo demanda. Podría involucrar la personalización de los agentes con información específica de la organización o del tenant.
    *   *Referencia:* `server/integrations/agent-builder.ts`

#### Servicios de Inteligencia Artificial (IA) y Correlación

La plataforma utiliza IA para mejorar la detección y el análisis de amenazas.

*   **`server/ai-service.ts`**: Podría ser un servicio genérico que interactúa con modelos de IA (posiblemente OpenAI, como se menciona en el README). Sus funciones podrían incluir el análisis de logs, la generación de resúmenes de incidentes, la clasificación de alertas o la asistencia en lenguaje natural para los analistas.
    *   *Referencia:* `server/ai-service.ts`
*   **`server/advanced-ai-service.ts`**: Sugiere funcionalidades de IA más especializadas o potentes, quizás para análisis de comportamiento, detección de anomalías complejas o modelado predictivo de amenazas.
    *   *Referencia:* `server/advanced-ai-service.ts`
*   **`server/integrations/ai-correlation-engine.ts`**: Este componente es clave para un SOC inteligente. Su función es correlacionar eventos de múltiples fuentes (logs, alertas, inteligencia de amenazas) utilizando algoritmos de IA para identificar patrones complejos, reducir falsos positivos y descubrir incidentes de seguridad que de otro modo pasarían desapercibidos.
    *   *Referencia:* `server/integrations/ai-correlation-engine.ts`
*   **`server/integrations/ai-parser-service.ts`**: Los datos de seguridad provienen de una gran variedad de formatos. Este servicio probablemente utiliza IA para parsear y normalizar logs y otros datos no estructurados o semi-estructurados, transformándolos en un formato consistente para su posterior análisis y correlación.
    *   *Referencia:* `server/integrations/ai-parser-service.ts`
*   **`server/integrations/ai-processing-queue.ts`**: Las tareas de IA pueden ser computacionalmente intensivas. Una cola de procesamiento (por ejemplo, usando RabbitMQ o Redis) es esencial para manejar estas tareas de forma asíncrona, asegurando que la aplicación principal siga respondiendo y evitando la pérdida de datos o análisis.
    *   *Referencia:* `server/integrations/ai-processing-queue.ts`

#### Gestión de Alertas y Enriquecimiento

*   **`server/integrations/alerts.ts`**: Módulo dedicado a la gestión de alertas de seguridad. Esto incluye la recepción, almacenamiento, priorización y visualización de alertas generadas por los agentes, conectores de datos u otros sistemas de detección.
    *   *Referencia:* `server/integrations/alerts.ts`
*   **`server/integrations/alertEnrichment.ts`**: Una vez que se genera una alerta, este servicio la enriquece con información contextual adicional. Esto puede implicar consultar bases de datos de vulnerabilidades (como se menciona en el README), servicios de geolocalización de IP, información de VirusTotal, o datos internos sobre los activos afectados. El enriquecimiento ayuda a los analistas a comprender mejor el alcance y la criticidad de una alerta.
    *   *Referencia:* `server/integrations/alertEnrichment.ts`

#### Conectores de Datos (`connectors/`)

Para ser efectivo, un SOC necesita ingestar datos de múltiples fuentes.

*   **`server/integrations/connectors.ts`**: Actúa como el gestor o coordinador principal para los diferentes conectores de datos.
    *   *Referencia:* `server/integrations/connectors.ts`
*   **`server/integrations/connectors/`**: Este subdirectorio contiene las implementaciones específicas para cada tipo de conector.
    *   **`base.ts`**: Probablemente define una clase o interfaz base abstracta con la funcionalidad común que todos los conectores deben implementar.
        *   *Referencia:* `server/integrations/connectors/base.ts`
    *   **`agent.ts`**: Un conector específico para recibir datos de los agentes desplegados.
        *   *Referencia:* `server/integrations/connectors/agent.ts`
    *   **`api.ts`**: Permite la ingesta de datos desde APIs de terceros (e.g., servicios en la nube, otras herramientas de seguridad).
        *   *Referencia:* `server/integrations/connectors/api.ts`
    *   **`syslog.ts`**: Un conector estándar para recibir logs a través del protocolo Syslog, comúnmente utilizado por dispositivos de red y servidores.
        *   *Referencia:* `server/integrations/connectors/syslog.ts`
    *   **`implementations.ts`**: Podría ser un archivo que agrupa o exporta todas las implementaciones de conectores disponibles.
        *   *Referencia:* `server/integrations/connectors/implementations.ts`
    *   **`index.ts`**: Punto de entrada del módulo de conectores, probablemente exportando las funcionalidades necesarias.
        *   *Referencia:* `server/integrations/connectors/index.ts`
    *   **`jwt-auth.ts`**: Podría ser un helper o parte de la configuración para conectores que requieren autenticación basada en JWT.
        *   *Referencia:* `server/integrations/connectors/jwt-auth.ts`

#### Orquestación y Automatización (SOAR)

*   **`server/integrations/playbook-executor.ts`**: Este componente es fundamental para las capacidades SOAR (Security Orchestration, Automation and Response). Ejecuta "playbooks" o flujos de trabajo automatizados en respuesta a alertas o incidentes. Estos playbooks pueden realizar acciones como bloquear una IP, aislar un host, o crear un ticket en un sistema de gestión de incidentes.
    *   *Referencia:* `server/integrations/playbook-executor.ts`
*   **`migrations/0007_add_playbooks.sql`**: La existencia de esta migración confirma la funcionalidad de playbooks, añadiendo las tablas necesarias a la base de datos para almacenarlos.
    *   *Referencia:* `migrations/0007_add_playbooks.sql`

#### Integración de Pagos (Stripe)

Al ser una plataforma SaaS, la gestión de suscripciones y pagos es esencial.

*   **`server/integrations/stripe/`**: Directorio que contiene la lógica específica para la integración con Stripe.
    *   **`stripe-routes.ts`**: Define los endpoints relacionados con Stripe, como la creación de sesiones de checkout, la gestión de suscripciones y la recepción de webhooks de Stripe.
        *   *Referencia:* `server/integrations/stripe/stripe-routes.ts`
    *   **`stripe-service.ts`**: Encapsula la interacción con la API de Stripe, manejando la creación de clientes, productos, precios, suscripciones, facturas, etc.
        *   *Referencia:* `server/integrations/stripe/stripe-service.ts` (y archivos relacionados como `.bak`, `.fixed`)
*   **`server/integrations/stripe-checkout.ts`**: Lógica específica para el proceso de pago y creación de suscripciones.
    *   *Referencia:* `server/integrations/stripe-checkout.ts`
*   **`server/integrations/stripe-service-wrapper.ts`**: Podría ser una capa de abstracción o un envoltorio sobre `stripe-service.ts` para simplificar su uso en otras partes de la aplicación.
    *   *Referencia:* `server/integrations/stripe-service-wrapper.ts`
*   **`migrations/0007_create_plans_table.sql`** y **`migrations/0008_populate_plans.sql`**: Estas migraciones crean y pueblan las tablas necesarias para definir los diferentes planes de suscripción que ofrece la plataforma.
    *   *Referencia:* `migrations/0007_create_plans_table.sql`, `migrations/0008_populate_plans.sql`

#### Fuentes de Inteligencia de Amenazas

*   **`server/integrations/threatFeeds.ts`**: Gestiona la ingesta y procesamiento de datos de fuentes de inteligencia de amenazas (Threat Intelligence Feeds). Estas fuentes proporcionan información actualizada sobre indicadores de compromiso (IoCs), nuevasulnerabilidades, tácticas de atacantes, etc.
    *   *Referencia:* `server/integrations/threatFeeds.ts`
*   **`server/integrations/taxii-connector.ts`**: TAXII (Trusted Automated eXchange of Intelligence Information) es un protocolo estándar para el intercambio de inteligencia de amenazas. Este conector permite a la plataforma consumir feeds que utilizan este protocolo.
    *   *Referencia:* `server/integrations/taxii-connector.ts`
*   **`migrations/0006_add_threat_feeds.sql`**: Añade las tablas necesarias a la base de datos para almacenar y gestionar la información de las fuentes de inteligencia de amenazas.
    *   *Referencia:* `migrations/0006_add_threat_feeds.sql`

#### Otros Servicios de Integración

*   **`server/integrations/logger.ts`**: Implementa un sistema de logging robusto para registrar eventos importantes del servidor, errores, y actividad de depuración. Es fundamental para el monitoreo y la solución de problemas de la propia plataforma.
    *   *Referencia:* `server/integrations/logger.ts`
*   **`server/integrations/scheduler.ts`**: Se utiliza para programar tareas recurrentes, como la actualización de feeds de inteligencia de amenazas, la ejecución de playbooks programados, la generación de reportes o tareas de mantenimiento.
    *   *Referencia:* `server/integrations/scheduler.ts`
*   **`server/integrations/structured-data-parser.ts`**: Además del `ai-parser-service`, podría haber un parser más tradicional para datos estructurados o con formatos conocidos que no necesariamente requieren IA para su procesamiento.
    *   *Referencia:* `server/integrations/structured-data-parser.ts`
*   **`server/integrations/advanced-correlation-algorithms.ts`**: Podría complementar al `ai-correlation-engine.ts` con algoritmos de correlación más tradicionales o específicos que no se basan necesariamente en IA, pero que son importantes para la detección.
    *   *Referencia:* `server/integrations/advanced-correlation-algorithms.ts`


### Almacenamiento

*   **`server/storage.ts`**: Este módulo maneja la lógica de almacenamiento de archivos, como pueden ser los agentes generados para descarga, reportes, o cualquier otro artefacto que necesite ser persistido en el sistema de archivos o en un servicio de almacenamiento en la nube (como AWS S3). Los archivos con extensiones `.fixed`, `.new`, `.old` sugieren un historial de refactorización o corrección de bugs.
    *   *Referencia:* `server/storage.ts`
*   **`server/istorage.ts`**: Probablemente define una interfaz (`IStorage`) para el servicio de almacenamiento, permitiendo implementaciones intercambiables (por ejemplo, almacenamiento local vs. almacenamiento en la nube) y facilitando las pruebas unitarias mediante mocks.
    *   *Referencia:* `server/istorage.ts`

Esto cubre una parte significativa de los componentes del servidor.

## Componentes del Cliente (`client/`)

El directorio `client/` contiene la aplicación frontend, que es la interfaz de usuario con la que los usuarios interactúan para gestionar la plataforma SOC Inteligente SaaS. Está desarrollada utilizando React, TypeScript y Vite, lo que proporciona una experiencia de desarrollo moderna y un rendimiento eficiente.

### Estructura Principal y Punto de Entrada

*   **`client/index.html`**: Es el archivo HTML principal que sirve como punto de entrada para la aplicación React. El bundle de JavaScript generado por Vite se inyecta aquí.
    *   *Referencia:* `client/index.html`
*   **`client/src/main.tsx`**: Este es el punto de entrada de la aplicación React. Aquí se renderiza el componente raíz (`App`) en el DOM. También es común configurar aquí proveedores globales, como el `QueryClient` para React Query o el `Router`.
    *   *Referencia:* `client/src/main.tsx`
*   **`client/src/App.tsx`**: Es el componente raíz de la aplicación. Define la estructura general de las páginas, incluyendo el layout principal (menús de navegación, cabeceras, etc.) y el sistema de enrutamiento que determina qué página o componente se muestra según la URL actual.
    *   *Referencia:* `client/src/App.tsx`
*   **`client/src/index.css`**: Archivo CSS global que aplica estilos base a toda la aplicación. Podría estar complementado o reemplazado en parte por frameworks de UI como Tailwind CSS.
    *   *Referencia:* `client/src/index.css` (y `tailwind.config.ts`, `postcss.config.js` para Tailwind)

### Páginas Principales (`client/src/pages/`)

El directorio `client/src/pages/` contiene los componentes de React que representan las diferentes vistas o secciones principales de la aplicación. Cada archivo `.tsx` aquí suele corresponder a una URL específica.

*   **`dashboard.tsx`**: Muestra el panel de control principal, con visualizaciones y resúmenes del estado de la seguridad.
    *   *Referencia:* `client/src/pages/dashboard.tsx`
*   **`alerts.tsx`**: Página para visualizar, filtrar y gestionar las alertas de seguridad.
    *   *Referencia:* `client/src/pages/alerts.tsx`
*   **`incident.tsx`** y **`incident-new.tsx`**: Secciones para la gestión de incidentes de seguridad, incluyendo su creación, visualización y seguimiento.
    *   *Referencia:* `client/src/pages/incident.tsx`, `client/src/pages/incident-new.tsx`
*   **`threat-intelligence.tsx`**: Interfaz para interactuar con los datos de inteligencia de amenazas.
    *   *Referencia:* `client/src/pages/threat-intelligence.tsx`
*   **`soar.tsx`**: Sección dedicada a la Orquestación, Automatización y Respuesta de Seguridad (SOAR), donde se gestionan y ejecutan los playbooks.
    *   *Referencia:* `client/src/pages/soar.tsx`
*   **`connectors.tsx`**: Página para configurar y gestionar los conectores de datos. El archivo `connectors.tsx.new` sugiere una posible refactorización o nueva versión de esta página.
    *   *Referencia:* `client/src/pages/connectors.tsx`, `client/src/pages/connectors.tsx.new`
*   **`agents.tsx`**: Interfaz para gestionar los agentes de monitoreo, posiblemente incluyendo su descarga y estado.
    *   *Referencia:* `client/src/pages/agents.tsx`
*   **`users.tsx`**: Página para la administración de usuarios de la plataforma.
    *   *Referencia:* `client/src/pages/users.tsx`
*   **`configuration.tsx`**: Sección para configuraciones generales de la plataforma.
    *   *Referencia:* `client/src/pages/configuration.tsx`
*   **`reports.tsx`**: Para generar y visualizar reportes de seguridad.
    *   *Referencia:* `client/src/pages/reports.tsx`
*   **`analytics.tsx`**: Podría ofrecer herramientas de análisis de datos más profundas.
    *   *Referencia:* `client/src/pages/analytics.tsx`
*   **`auth-page.tsx`**: Página para el inicio de sesión y registro de usuarios.
    *   *Referencia:* `client/src/pages/auth-page.tsx`
*   **`Billing.tsx`** y **`checkout.tsx`**: Componentes relacionados con la gestión de la suscripción y el proceso de pago, integrándose con Stripe. El subdirectorio `billing/` dentro de `pages` (`client/src/pages/billing/`) podría contener más componentes específicos.
    *   *Referencia:* `client/src/pages/Billing.tsx`, `client/src/pages/checkout.tsx`, `client/src/pages/billing/`
*   **`home-page.tsx`**: La página de inicio o landing page de la aplicación.
    *   *Referencia:* `client/src/pages/home-page.tsx`
*   **`not-found.tsx`**: Página que se muestra cuando se accede a una URL no existente.
    *   *Referencia:* `client/src/pages/not-found.tsx`

### Componentes Reutilizables (`client/src/components/`)

Este directorio es crucial para mantener un código modular y consistente. Contiene subdirectorios para diferentes categorías de componentes:

*   **`ui/`**: Alberga una colección de componentes de UI genéricos y reutilizables (botones, inputs, modales, tarjetas, etc.), a menudo construidos sobre una librería como Shadcn/UI (evidenciado por la estructura y nombres de archivos como `button.tsx`, `dialog.tsx`, `card.tsx`).
    *   *Referencia:* `client/src/components/ui/`
*   **`layout/`**: Componentes que definen la estructura visual de las páginas, como la barra de navegación, el menú lateral, la cabecera, el pie de página.
    *   *Referencia:* `client/src/components/layout/`
*   **Otros subdirectorios específicos de funcionalidades**:
    *   `billing/`: Componentes específicos para la sección de facturación.
    *   `configuration/`: Componentes para la configuración.
    *   `dashboard/`: Componentes utilizados en el dashboard.
    *   `settings/`: Componentes para ajustes.
    *   `soar/`: Componentes para la funcionalidad SOAR.
    *   `subscription/`: Componentes para la gestión de suscripciones.
    *   `threat-intelligence/`: Componentes para la inteligencia de amenazas.
    *   *Referencia:* `client/src/components/*`

### Lógica de Cliente y Utilidades (`client/src/lib/` y `client/src/hooks/`)

*   **`client/src/lib/`**: Contiene lógica de soporte y utilidades para el cliente.
    *   **`protected-route.tsx`**: Un componente de orden superior o una lógica para proteger ciertas rutas, redirigiendo a la página de inicio de sesión si el usuario no está autenticado.
        *   *Referencia:* `client/src/lib/protected-route.tsx`
    *   **`queryClient.ts`**: Configuración de `TanStack Query` (React Query), una librería para la gestión del estado del servidor, fetching de datos, caching, etc.
        *   *Referencia:* `client/src/lib/queryClient.ts`
    *   **`utils.ts`**: Funciones de utilidad genéricas (formateo de fechas, validaciones, etc.). El subdirectorio `utils/` podría contener utilidades más específicas.
        *   *Referencia:* `client/src/lib/utils.ts`, `client/src/lib/utils/`

*   **`client/src/hooks/`**: Contiene hooks personalizados de React para encapsular y reutilizar lógica con estado o efectos secundarios.
    *   **`use-auth.tsx`**: Hook para gestionar el estado de autenticación del usuario y proporcionar funciones relacionadas (login, logout).
        *   *Referencia:* `client/src/hooks/use-auth.tsx`
    *   **`use-mobile.tsx`**: Hook para detectar si la aplicación se está visualizando en un dispositivo móvil, permitiendo adaptar la UI.
        *   *Referencia:* `client/src/hooks/use-mobile.tsx`
    *   **`use-toast.ts`**: Hook para mostrar notificaciones (toasts) al usuario.
        *   *Referencia:* `client/src/hooks/use-toast.ts`
    *   **`useBilling.ts`**: Hook específico para la lógica de facturación en el cliente.
        *   *Referencia:* `client/src/hooks/useBilling.ts`

## Agentes de Monitoreo (`agents/`)

El directorio `agents/` es fundamental ya que contiene el código fuente de los agentes de monitoreo que se instalan en los sistemas cliente (endpoints) para recolectar datos de seguridad y enviarlos a la plataforma SOC Inteligente SaaS. La capacidad de generar estos agentes directamente desde la aplicación (como se infiere de `server/integrations/agent-builder.ts` y el `README.md`) es una característica clave.

### Propósito General

Los agentes son programas ligeros diseñados para:
*   Recolectar eventos de seguridad y logs del sistema operativo y aplicaciones.
*   Monitorear la actividad del sistema en busca de comportamientos sospechosos.
*   Ejecutar tareas de respuesta instruidas por el servidor central (e.g., aislar un host).
*   Comunicarse de forma segura y eficiente con el servidor de la plataforma SOC.

### Estructura de los Agentes

El código de los agentes está organizado para soportar múltiples sistemas operativos:

*   **`agents/linux/`**: Contiene la implementación específica del agente para sistemas Linux.
    *   `index.ts`: Punto de entrada o archivo principal para el agente Linux.
    *   `linux-agent.ts`: Lógica principal del agente Linux.
    *   *Referencia:* `agents/linux/`

*   **`agents/macos/`**: Contiene la implementación específica del agente para sistemas macOS.
    *   `index.ts`: Punto de entrada para el agente macOS.
    *   `macos-agent.ts`: Lógica principal del agente macOS.
    *   El subdirectorio `common/` dentro de `agents/macos/` (e.g., `agents/macos/common/agent-base.js`) sugiere que podría haber una base de código más antigua o una estructura ligeramente diferente para el agente de macOS, posiblemente en JavaScript. Esto podría indicar una evolución o diferentes equipos trabajando en los agentes.
    *   *Referencia:* `agents/macos/`

*   **`agents/windows/`**: Contiene la implementación específica del agente para sistemas Windows.
    *   `windows-agent.ts`: Lógica principal del agente Windows.
    *   *Referencia:* `agents/windows/`

### Componentes Comunes (`agents/common/`)

Existe un directorio `agents/common/` a nivel raíz de los agentes, lo que sugiere una base de código común en TypeScript utilizada por las implementaciones más recientes de los agentes (Linux, Windows y posiblemente una versión más nueva de macOS).

*   **`agents/common/agent-base.ts`**: Podría definir una clase base o funcionalidades compartidas por todos los agentes, independientemente del sistema operativo. Esto ayuda a evitar la duplicación de código y asegura un comportamiento consistente.
    *   *Referencia:* `agents/common/agent-base.ts`
*   **`agents/common/agent-config.ts`**: Maneja la configuración del agente en formato YAML, como la dirección del servidor, la frecuencia de sondeo, los tipos de eventos a recolectar, etc.
    *   *Referencia:* `agents/common/agent-config.ts`
*   **`agents/common/communication.ts`**: Encapsula la lógica de comunicación entre el agente y el servidor. Esto incluye el envío de datos recolectados y la recepción de comandos o actualizaciones de configuración. Podría implementar protocolos seguros como HTTPS.
    *   *Referencia:* `agents/common/communication.ts`
*   **`agents/common/monitoring.ts`**: Contiene la lógica central de monitoreo: qué archivos, procesos, conexiones de red o eventos del sistema operativo deben ser observados.
    *   *Referencia:* `agents/common/monitoring.ts`
*   **`agents/common/security.ts`**: Podría incluir funcionalidades de seguridad para el propio agente, como la validación de certificados del servidor, la encriptación de la comunicación o la protección contra la manipulación (anti-tampering).
    *   *Referencia:* `agents/common/security.ts`

*   **`agents/force-agent-reenroll.sh`**: Un script de utilidad, posiblemente para forzar a un agente a volver a registrarse con el servidor, útil en casos de problemas de comunicación o cambios de configuración importantes.
    *   *Referencia:* `agents/force-agent-reenroll.sh`

Anteriormente los agentes se distribuían como binarios ya compilados. A partir de esta versión la plataforma entrega un paquete con el **código fuente** del agente (`soc-agent-source-<os>-<id>.tar.gz`). Dicho paquete incluye el directorio `agents` y un `agent-config.json` generado. El usuario debe compilar el agente de forma manual siguiendo la [guía de compilación](docs/manual-agent-build.md).

## Datos Compartidos y Esquema de Base de Datos

La consistencia de los datos a través de las diferentes partes de la aplicación (servidor, cliente) es crucial. El proyecto maneja esto a través de un directorio `shared` y un sistema de migraciones para la base de datos.

### Código Compartido (`shared/`)

*   **`shared/schema.ts`**: Este es uno de los archivos más importantes para la integridad de los datos en toda la aplicación. Define el esquema de la base de datos utilizando Drizzle ORM. Esto incluye la definición de tablas, columnas, tipos de datos y relaciones. Al tener el esquema definido en TypeScript, se pueden generar tipos que son utilizados tanto por el backend (para interactuar con la base de datos) como potencialmente por el frontend (para entender la estructura de los datos que recibe). Esto ayuda a prevenir inconsistencias y errores en tiempo de ejecución.
    *   *Referencia:* `shared/schema.ts`

    Las tablas definidas aquí probablemente incluyen:
    *   Usuarios (`users`)
    *   Organizaciones/Tenants (`organizations`)
    *   Agentes (`agents`)
    *   Alertas (`alerts`)
    *   Incidentes (`incidents`)
    *   Planes de suscripción (`plans`, como se ve en `migrations/0007_create_plans_table.sql`)
    *   Fuentes de inteligencia de amenazas (`threat_feeds`, como en `migrations/0006_add_threat_feeds.sql`)
    *   Playbooks (`playbooks`, como en `migrations/0007_add_playbooks.sql`)
    *   Y muchas otras tablas necesarias para el funcionamiento de las diversas funcionalidades.

### Migraciones de Base de Datos (`migrations/`)

El directorio `migrations/` es esencial para la evolución y el versionado del esquema de la base de datos. Drizzle ORM, a través de Drizzle Kit, utiliza este directorio para gestionar los cambios en la estructura de la base de datos.

*   **Propósito**: Cada vez que se necesita un cambio en el esquema (añadir una tabla, modificar una columna, crear un índice), se genera un nuevo archivo de migración (generalmente SQL). Este archivo describe los cambios específicos a aplicar.
*   **Funcionamiento**: Al desplegar una nueva versión de la aplicación o al configurar el entorno de desarrollo, se aplican estas migraciones en orden secuencial para asegurar que la base de datos tenga la estructura correcta. Esto evita la necesidad de realizar cambios manuales en la base de datos, lo cual es propenso a errores.
*   **Ejemplos de archivos de migración**:
    *   `migrations/0000_schema_initial.sql`: Define el esquema inicial de la base de datos.
    *   `migrations/0006_add_threat_feeds.sql`: Añade tablas relacionadas con las fuentes de inteligencia de amenazas.
    *   `migrations/0007_add_playbooks.sql`: Añade tablas para la funcionalidad de playbooks.
    *   `migrations/0007_create_plans_table.sql`: Crea la tabla para los planes de suscripción.
    *   `migrations/0008_populate_plans.sql`: Inserta datos iniciales en la tabla de planes.
    *   *Referencia:* `migrations/`

La combinación de `shared/schema.ts` para la definición del esquema y `migrations/` para la gestión de su evolución asegura una base de datos robusta y bien definida, lo cual es crítico para la estabilidad y fiabilidad de la plataforma SOC Inteligente SaaS.

## Configuración y Despliegue

La configuración adecuada y un proceso de despliegue bien definido son esenciales para cualquier aplicación SaaS. Esta sección cubre los archivos y herramientas clave utilizados en el proyecto SOC Inteligente SaaS para estos propósitos.

### Contenerización con Docker

*   **`Dockerfile`**: Este archivo contiene las instrucciones para construir una imagen de Docker para la aplicación (o para partes de ella, como el servidor). Define el entorno de ejecución, incluyendo el sistema operativo base, las dependencias, las variables de entorno, los puertos expuestos y el comando para iniciar la aplicación. La contenerización asegura que la aplicación se ejecute de manera consistente en diferentes entornos.
    *   *Referencia:* `Dockerfile`

*   **`docker-compose.yml`**: Docker Compose se utiliza para definir y ejecutar aplicaciones Docker multi-contenedor. Este archivo describe los servicios que componen la aplicación (por ejemplo, el servidor backend, la base de datos, quizás un proxy inverso), cómo se interconectan (redes) y los volúmenes para la persistencia de datos. Facilita la configuración del entorno de desarrollo y el despliegue en producción.
    *   *Referencia:* `docker-compose.yml`

*   **`.dockerignore`**: Similar a `.gitignore`, este archivo especifica los archivos y directorios que deben ser ignorados por el motor de Docker al construir la imagen. Esto ayuda a reducir el tamaño de la imagen y a evitar la inclusión de archivos sensibles o innecesarios.
    *   *Referencia:* `.dockerignore`

### Gestión de Dependencias y Scripts

*   **`package.json`**: Es el archivo manifiesto para proyectos Node.js. Define las dependencias del proyecto (tanto para producción como para desarrollo), así como scripts para tareas comunes como iniciar el servidor de desarrollo, construir la aplicación, ejecutar pruebas, linting, etc. Es utilizado por `npm` o `yarn` para gestionar los paquetes.
    *   *Referencia:* `package.json`
*   **`package-lock.json`**: (o `yarn.lock`) Este archivo es generado automáticamente y registra las versiones exactas de todas las dependencias instaladas. Asegura que se utilice el mismo árbol de dependencias en todos los entornos, evitando problemas de "funciona en mi máquina".
    *   *Referencia:* `package-lock.json`

### Configuración del Frontend (Vite y TypeScript)

*   **`vite.config.ts`**: Archivo de configuración para Vite, el bundler y servidor de desarrollo utilizado para el frontend React. Permite configurar aspectos como plugins, optimizaciones de compilación, el servidor de desarrollo, y cómo se procesan los diferentes tipos de archivos.
    *   *Referencia:* `vite.config.ts`
*   **`tsconfig.json`**: Archivo de configuración para el compilador de TypeScript (tsc). Define las opciones del compilador, como la versión de ECMAScript a la que se compila, la configuración de los módulos, las rutas base, y las reglas de chequeo de tipos. Hay uno en la raíz del proyecto y probablemente otros en subdirectorios como `client/` y `server/` para configuraciones específicas.
    *   *Referencia:* `tsconfig.json` (y específicos en `client/`, `server/`)

### Configuración del Backend y Herramientas Adicionales

*   **`drizzle.config.ts`**: Archivo de configuración para Drizzle ORM, específicamente para Drizzle Kit (la herramienta CLI). Define la ubicación del esquema (`shared/schema.ts`), el directorio de salida para las migraciones (`migrations/`), el driver de la base de datos, y las credenciales de conexión.
    *   *Referencia:* `drizzle.config.ts`
*   **`tailwind.config.ts`**: Archivo de configuración para Tailwind CSS, si se utiliza para el estilizado del frontend. Permite personalizar la paleta de colores, fuentes, espaciados, y extender las clases de utilidad.
    *   *Referencia:* `tailwind.config.ts`
*   **`postcss.config.js`**: Configuración para PostCSS, una herramienta para transformar CSS con plugins. A menudo se usa junto con Tailwind CSS.
    *   *Referencia:* `postcss.config.js`
*   **`theme.json`**: Podría estar relacionado con la configuración del tema de la UI, especialmente si se utilizan componentes de Shadcn/UI o similares.
    *   *Referencia:* `theme.json`

### Scripts de Inicialización y Entrada

*   **`entrypoint.sh`**: Es común en imágenes Docker. Este script se ejecuta cuando el contenedor se inicia. Puede realizar tareas de configuración inicial antes de lanzar el proceso principal de la aplicación.
    *   *Referencia:* `entrypoint.sh`
*   **`init.sh`**: Otro script de inicialización, cuyo propósito exacto dependería de su contenido. Podría ser para configurar el entorno de desarrollo, inicializar la base de datos, o cualquier otra tarea preparatoria.
    *   *Referencia:* `init.sh`

Estos archivos y configuraciones son cruciales para asegurar que la plataforma SOC Inteligente SaaS pueda ser construida, probada, desplegada y ejecutada de manera confiable y eficiente.

## Contribuidores

Este proyecto es el resultado del trabajo de un equipo de desarrolladores dedicados a crear una solución de ciberseguridad robusta y eficiente. Para contribuir, por favor contacte a los administradores del proyecto o siga las guías de contribución si están disponibles.

## Licencia

La licencia bajo la cual se distribuye este software determinará cómo puede ser utilizado, modificado y distribuido. Por favor, consulte el archivo `LICENSE` en la raíz del repositorio (si existe) o contacte a los mantenedores para obtener información detallada sobre los términos de la licencia.
*(Nota: No se encontró un archivo LICENSE durante el análisis inicial, esta sección es un placeholder.)*

## Cómo Empezar / Instalación

Para poner en marcha este proyecto, generalmente se seguirían los siguientes pasos (suponiendo un entorno con Docker y Node.js preinstalados):

1.  **Clonar el repositorio:**
    ```bash
    git clone <URL_DEL_REPOSITORIO>
    cd <NOMBRE_DEL_DIRECTORIO_DEL_PROYECTO>
    ```

2.  **Configurar variables de entorno:**
    *   Podría ser necesario crear un archivo `.env` a partir de un `.env.example` y completar los valores para la base de datos, APIs de terceros (OpenAI, VirusTotal, Stripe), etc.

3.  **Levantar los servicios con Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
    Esto debería construir las imágenes necesarias (frontend, backend) e iniciar los contenedores (aplicación, base de datos).

4.  **Acceder a la aplicación:**
    *   El frontend debería estar accesible en `http://localhost:PUERTO_FRONTEND` (e.g., puerto 5173 si usa Vite por defecto).
    *   El backend expondrá su API en `http://localhost:PUERTO_BACKEND` (e.g., puerto 3000 o el configurado).

**Nota:** Estos son pasos genéricos. Consulte la documentación específica del proyecto o scripts de inicialización (`init.sh`, `entrypoint.sh`) para obtener instrucciones detalladas y adaptadas a este proyecto en particular. Podría ser necesario ejecutar migraciones de base de datos o instalar dependencias de frontend/backend manualmente si no está todo automatizado en el proceso de Docker.
