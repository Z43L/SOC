# Documentación de la API REST

## Propósito General

La API REST del SOC Inteligente SaaS proporciona endpoints para todas las funcionalidades del sistema. Está construida con **Express.js** y utiliza **TypeScript** para type safety. La API sigue principios RESTful y está diseñada para ser consumida tanto por el frontend como por integraciones externas.

## Arquitectura de la API

### Stack Tecnológico

- **Framework**: Express.js
- **Validación**: Zod schemas
- **Autenticación**: JWT + Passport.js
- **Base de Datos**: PostgreSQL + Drizzle ORM
- **Documentación**: Comentarios inline + esta documentación

### Estructura de Rutas

```
/api/
├── auth/                   # Autenticación y autorización
├── alerts/                 # Gestión de alertas
├── incidents/              # Gestión de incidentes
├── threat-intel/           # Inteligencia de amenazas
├── agents/                 # Gestión de agentes
├── connectors/             # Configuración de conectores
├── users/                  # Gestión de usuarios
├── analytics/              # Análisis y métricas
├── playbooks/              # Playbooks SOAR
├── billing/                # Facturación (Stripe)
├── ai/                     # Servicios de IA
└── system/                 # Administración del sistema
```

## Autenticación y Autorización

### Autenticación JWT

```typescript
// Headers requeridos para endpoints autenticados
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Roles de Usuario

- **admin**: Acceso completo al sistema
- **analyst**: Acceso a análisis y gestión de incidentes
- **viewer**: Solo lectura
- **agent**: Para agentes (acceso limitado)

### Middleware de Autenticación

```typescript
// Middleware que valida JWT y extrae usuario
app.use('/api', authenticateToken);

// Middleware de autorización por rol
app.use('/api/admin', requireRole('admin'));
```

## Endpoints Principales

### 1. Autenticación (`/api/auth`)

#### POST `/api/auth/login`

**Propósito**: Autenticar usuario y obtener JWT token.

**Request Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response Success (200)**:
```json
{
  "token": "jwt_token_string",
  "user": {
    "id": 1,
    "name": "Usuario",
    "username": "usuario",
    "email": "usuario@ejemplo.com",
    "role": "admin",
    "organizationId": 1
  }
}
```

**Response Error (401)**:
```json
{
  "message": "Invalid credentials"
}
```

#### POST `/api/auth/logout`

**Propósito**: Cerrar sesión del usuario.

**Headers**: `Authorization: Bearer <token>`

**Response (200)**:
```json
{
  "message": "Logged out successfully"
}
```

#### GET `/api/auth/me`

**Propósito**: Obtener información del usuario autenticado.

**Headers**: `Authorization: Bearer <token>`

**Response (200)**:
```json
{
  "id": 1,
  "name": "Usuario",
  "username": "usuario",
  "email": "usuario@ejemplo.com",
  "role": "admin",
  "organizationId": 1,
  "lastLogin": "2024-01-15T10:30:00Z"
}
```

### 2. Alertas (`/api/alerts`)

#### GET `/api/alerts`

**Propósito**: Obtener lista de alertas con filtros y paginación.

**Query Parameters**:
- `page`: Número de página (default: 1)
- `limit`: Elementos por página (default: 20)
- `severity`: Filtro por severidad ('critical', 'high', 'medium', 'low')
- `status`: Filtro por estado ('new', 'in_progress', 'resolved', 'acknowledged')
- `source`: Filtro por fuente
- `assignedTo`: ID del usuario asignado

**Response (200)**:
```json
{
  "alerts": [
    {
      "id": 1,
      "title": "Suspicious Login Attempt",
      "description": "Multiple failed login attempts from unknown IP",
      "severity": "high",
      "source": "auth_system",
      "sourceIp": "192.168.1.100",
      "status": "new",
      "timestamp": "2024-01-15T10:30:00Z",
      "assignedTo": null,
      "metadata": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

#### GET `/api/alerts/:id`

**Propósito**: Obtener detalle de una alerta específica.

**Path Parameters**:
- `id`: ID de la alerta

**Response (200)**:
```json
{
  "id": 1,
  "title": "Suspicious Login Attempt",
  "description": "Multiple failed login attempts from unknown IP",
  "severity": "high",
  "source": "auth_system",
  "sourceIp": "192.168.1.100",
  "destinationIp": null,
  "fileHash": null,
  "url": null,
  "cveId": null,
  "timestamp": "2024-01-15T10:30:00Z",
  "status": "new",
  "assignedTo": null,
  "metadata": {
    "failed_attempts": 5,
    "user_agent": "Mozilla/5.0...",
    "geolocation": {
      "country": "Unknown",
      "city": "Unknown"
    }
  },
  "enrichments": [
    {
      "provider": "VirusTotal",
      "data": {
        "malicious": 0,
        "suspicious": 2
      }
    }
  ]
}
```

#### POST `/api/alerts`

**Propósito**: Crear nueva alerta.

**Request Body**:
```json
{
  "title": "string",
  "description": "string",
  "severity": "critical|high|medium|low",
  "source": "string",
  "sourceIp": "string (optional)",
  "destinationIp": "string (optional)",
  "fileHash": "string (optional)",
  "url": "string (optional)",
  "cveId": "string (optional)",
  "metadata": "object (optional)"
}
```

**Response (201)**:
```json
{
  "id": 123,
  "message": "Alert created successfully"
}
```

#### PUT `/api/alerts/:id`

**Propósito**: Actualizar alerta existente.

**Request Body**: Campos a actualizar (parcial)

**Response (200)**:
```json
{
  "message": "Alert updated successfully"
}
```

#### POST `/api/alerts/:id/assign`

**Propósito**: Asignar alerta a un usuario.

**Request Body**:
```json
{
  "userId": 5
}
```

**Response (200)**:
```json
{
  "message": "Alert assigned successfully"
}
```

### 3. Incidentes (`/api/incidents`)

#### GET `/api/incidents`

**Propósito**: Obtener lista de incidentes.

**Query Parameters**: Similar a alertas

**Response (200)**:
```json
{
  "incidents": [
    {
      "id": 1,
      "title": "Security Breach Investigation",
      "description": "Multiple related alerts indicate potential breach",
      "severity": "critical",
      "status": "in_progress",
      "assignedTo": 5,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T12:00:00Z",
      "relatedAlerts": [1, 2, 3],
      "mitreTactics": ["T1078", "T1110"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 25,
    "pages": 2
  }
}
```

#### POST `/api/incidents`

**Propósito**: Crear nuevo incidente.

**Request Body**:
```json
{
  "title": "string",
  "description": "string",
  "severity": "critical|high|medium|low",
  "relatedAlerts": [1, 2, 3],
  "assignedTo": 5
}
```

### 4. Agentes (`/api/agents`)

#### GET `/api/agents`

**Propósito**: Obtener lista de agentes registrados.

**Response (200)**:
```json
{
  "agents": [
    {
      "id": "agent-uuid-123",
      "hostname": "DESKTOP-ABC123",
      "platform": "windows",
      "version": "1.0.0",
      "status": "online",
      "lastSeen": "2024-01-15T12:00:00Z",
      "ip": "192.168.1.50",
      "collectors": ["process", "network", "file"],
      "organizationId": 1
    }
  ]
}
```

#### POST `/api/agents/register`

**Propósito**: Registrar nuevo agente.

**Request Body**:
```json
{
  "registrationKey": "temp-key-123",
  "hostname": "DESKTOP-ABC123",
  "platform": "windows",
  "version": "1.0.0",
  "ip": "192.168.1.50"
}
```

#### POST `/api/agents/:id/command`

**Propósito**: Enviar comando a agente específico.

**Request Body**:
```json
{
  "command": "collect_now|update_config|restart",
  "parameters": {}
}
```

#### POST `/api/agents/build`

**Propósito**: Construir paquete de agente personalizado.

**Request Body**:
```json
{
  "platform": "windows|linux|macos",
  "collectors": ["process", "network", "file"],
  "config": {
    "uploadInterval": 300,
    "serverUrl": "https://soc.ejemplo.com"
  }
}
```

### 5. Inteligencia de Amenazas (`/api/threat-intel`)

#### GET `/api/threat-intel`

**Propósito**: Obtener feeds de inteligencia de amenazas.

**Response (200)**:
```json
{
  "threats": [
    {
      "id": 1,
      "type": "ioc",
      "title": "Malicious IP Range",
      "description": "Known botnet C&C servers",
      "source": "AlienVault OTX",
      "severity": "high",
      "confidence": 85,
      "iocs": {
        "ips": ["192.168.1.1", "10.0.0.1"],
        "domains": ["malware.example.com"]
      },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### POST `/api/threat-intel/import`

**Propósito**: Importar feeds de inteligencia.

**Request Body**:
```json
{
  "source": "manual|otx|misp|custom",
  "data": {
    "iocs": [...],
    "metadata": {}
  }
}
```

### 6. Análisis con IA (`/api/ai`)

#### POST `/api/ai/analyze-alert`

**Propósito**: Analizar alerta con IA.

**Request Body**:
```json
{
  "alertId": 123,
  "model": "gpt-4|claude-3|auto"
}
```

**Response (200)**:
```json
{
  "analysis": {
    "severity_assessment": "high",
    "attack_pattern": "Credential Stuffing",
    "recommendations": [
      "Block source IP",
      "Review user account security"
    ],
    "confidence": 0.85,
    "mitre_tactics": ["T1110"]
  }
}
```

#### POST `/api/ai/correlate-alerts`

**Propósito**: Correlacionar alertas usando IA.

**Request Body**:
```json
{
  "alertIds": [1, 2, 3, 4],
  "timeWindow": "1h|24h|7d"
}
```

#### POST `/api/ai/threat-intel-analysis`

**Propósito**: Analizar relevancia de threat intelligence.

**Request Body**:
```json
{
  "threatIntelId": 5,
  "organizationContext": {
    "industry": "financial",
    "assets": ["web_servers", "databases"]
  }
}
```

### 7. Conectores (`/api/connectors`)

#### GET `/api/connectors`

**Propósito**: Obtener lista de conectores configurados.

**Response (200)**:
```json
{
  "connectors": [
    {
      "id": 1,
      "name": "AWS CloudTrail",
      "type": "api",
      "status": "active",
      "lastSync": "2024-01-15T12:00:00Z",
      "configuration": {
        "region": "us-east-1",
        "bucketName": "cloudtrail-logs"
      }
    }
  ]
}
```

#### POST `/api/connectors`

**Propósito**: Crear nuevo conector.

**Request Body**:
```json
{
  "name": "string",
  "type": "api|syslog|agent",
  "configuration": {
    "url": "string",
    "apiKey": "string",
    "pollInterval": 300
  }
}
```

#### PUT `/api/connectors/:id/toggle`

**Propósito**: Activar/desactivar conector.

**Response (200)**:
```json
{
  "message": "Connector toggled successfully",
  "status": "active|inactive"
}
```

### 8. Analytics (`/api/analytics`)

#### GET `/api/analytics/metrics`

**Propósito**: Obtener métricas del dashboard.

**Response (200)**:
```json
{
  "metrics": [
    {
      "name": "total_alerts",
      "value": "1,247",
      "trend": "up",
      "changePercentage": 12
    },
    {
      "name": "active_incidents",
      "value": "8",
      "trend": "stable",
      "changePercentage": 0
    }
  ]
}
```

#### GET `/api/analytics/timeseries`

**Propósito**: Obtener datos de series temporales.

**Query Parameters**:
- `metric`: Métrica a consultar
- `timeRange`: Rango temporal (1h, 24h, 7d, 30d)
- `granularity`: Granularidad (hour, day, week)

**Response (200)**:
```json
{
  "data": [
    {
      "timestamp": "2024-01-15T00:00:00Z",
      "value": 45
    },
    {
      "timestamp": "2024-01-15T01:00:00Z",
      "value": 52
    }
  ]
}
```

## Códigos de Estado HTTP

### Códigos de Éxito
- **200 OK**: Operación exitosa
- **201 Created**: Recurso creado exitosamente
- **204 No Content**: Operación exitosa sin contenido de respuesta

### Códigos de Error del Cliente
- **400 Bad Request**: Request malformado o parámetros inválidos
- **401 Unauthorized**: No autenticado o token inválido
- **403 Forbidden**: No autorizado para esta operación
- **404 Not Found**: Recurso no encontrado
- **409 Conflict**: Conflicto con estado actual (ej: recurso ya existe)
- **422 Unprocessable Entity**: Errores de validación

### Códigos de Error del Servidor
- **500 Internal Server Error**: Error interno del servidor
- **502 Bad Gateway**: Error en servicio externo
- **503 Service Unavailable**: Servicio temporalmente no disponible

## Formato de Errores

Todos los errores siguen un formato consistente:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "severity",
      "issue": "must be one of: critical, high, medium, low"
    }
  }
}
```

## Validación de Datos

La API utiliza **Zod schemas** para validación:

```typescript
// Ejemplo de validación de alerta
const createAlertSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  severity: SeverityTypes,
  source: z.string().min(1),
  sourceIp: z.string().ip().optional(),
  metadata: z.object({}).optional()
});
```

## Rate Limiting

- **Autenticación**: 5 intentos por minuto por IP
- **APIs generales**: 100 requests por minuto por usuario
- **APIs de IA**: 10 requests por minuto por usuario
- **APIs de agentes**: 1000 requests por minuto por agente

## Paginación

Endpoints que devuelven listas implementan paginación:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## WebSocket Events

Para actualizaciones en tiempo real:

```javascript
// Eventos emitidos por el servidor
socket.on('new_alert', (alert) => {});
socket.on('alert_updated', (alert) => {});
socket.on('incident_created', (incident) => {});
socket.on('agent_status_changed', (agent) => {});
```

---

Esta API está diseñada para ser robusta, escalable y fácil de integrar tanto para el frontend como para sistemas externos.