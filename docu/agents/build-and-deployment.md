# Compilación y Despliegue de Agentes

## Introducción

Esta guía detalla el proceso completo de compilación, empaquetado y despliegue de los agentes SOC para diferentes plataformas.

## Requisitos Previos

### Dependencias del Sistema
- **Node.js**: v18 o superior
- **TypeScript**: v5.6.3 o superior
- **npm**: Para gestión de dependencias
- **pkg**: Para empaquetado de binarios

### Herramientas de Compilación por Plataforma

#### Windows
- **Visual Studio Build Tools**: Para módulos nativos
- **Windows SDK**: Para APIs nativas de Windows

#### Linux
- **build-essential**: Herramientas de compilación básicas
- **python3-dev**: Para módulos que requieren Python

#### macOS
- **Xcode Command Line Tools**: Herramientas de desarrollo

## Estructura del Proyecto de Agentes

```
agents/
├── package.json                  # Dependencias y scripts de build
├── tsconfig.json                # Configuración de TypeScript
├── main.ts                      # Entry point principal
├── main-simple.ts               # Entry point simplificado
├── main-windows.ts              # Entry point específico Windows
├── main-enhanced.ts             # Entry point con características avanzadas
├── windows-agent.ts             # Implementación específica Windows
├── core/                        # Módulos centrales
├── collectors/                  # Sistema de colectores
├── commands/                    # Ejecutor de comandos
├── updater/                     # Sistema de actualización
├── common/                      # Utilidades compartidas
└── dist/                        # Archivos compilados
```

## Configuración de Compilación

### package.json - Scripts de Build

```json
{
  "name": "soc-agent",
  "version": "1.0.0",
  "description": "SOC Intelligent Agent",
  "main": "main-simple.ts",
  "type": "module",
  "scripts": {
    "build": "tsc main-simple.ts --outDir dist --target ES2020 --module CommonJS --strict && mv dist/main-simple.js dist/main-simple.cjs",
    "build:windows": "tsc main-windows.ts --outDir dist --target ES2020 --module CommonJS --strict --esModuleInterop && mv dist/main-windows.js dist/main-windows.cjs",
    "build:all": "npm run build && npm run build:windows",
    "test:windows": "tsc test-windows-collectors.ts --outDir dist --target ES2020 --module CommonJS --strict --esModuleInterop && node dist/test-windows-collectors.js",
    "package": "npm run package:all",
    "package:all": "npm run package:linux && npm run package:windows && npm run package:macos",
    "package:linux": "pkg dist/main-simple.js --targets node18-linux-x64,node18-linux-arm64 --output ../dist/agents/soc-agent-linux",
    "package:windows": "pkg dist/main-windows.js --targets node18-win-x64 --output ../dist/agents/soc-agent-windows.exe",
    "package:macos": "pkg dist/main-simple.js --targets node18-macos-x64,node18-macos-arm64 --output ../dist/agents/soc-agent-macos"
  }
}
```

### tsconfig.json - Configuración TypeScript

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "removeComments": true,
    "noImplicitAny": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": [
    "**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "test-*.ts"
  ]
}
```

### Configuración PKG para Empaquetado

```json
{
  "pkg": {
    "assets": [
      "**/*.yaml",
      "**/*.yml", 
      "**/*.json"
    ],
    "scripts": [
      "dist/main-windows.js"
    ]
  }
}
```

## Proceso de Compilación

### 1. Instalación de Dependencias

```bash
cd agents/
npm install
```

### 2. Compilación Simple (Para Testing)

```bash
# Compilar versión simplificada
npm run build

# Verificar compilación
node dist/main-simple.cjs --help
```

### 3. Compilación Windows

```bash
# Compilar versión específica para Windows
npm run build:windows

# Verificar compilación en Windows
node dist/main-windows.cjs --help
```

### 4. Compilación Completa

```bash
# Compilar todas las variantes
npm run build:all
```

## Empaquetado de Binarios

### Empaquetado Individual por Plataforma

#### Linux
```bash
npm run package:linux
```

Genera:
- `../dist/agents/soc-agent-linux-x64`: Para sistemas Linux x64
- `../dist/agents/soc-agent-linux-arm64`: Para sistemas Linux ARM64

#### Windows
```bash
npm run package:windows
```

Genera:
- `../dist/agents/soc-agent-windows.exe`: Para sistemas Windows x64

#### macOS
```bash
npm run package:macos
```

Genera:
- `../dist/agents/soc-agent-macos-x64`: Para macOS Intel
- `../dist/agents/soc-agent-macos-arm64`: Para macOS Apple Silicon

### Empaquetado Completo

```bash
# Empaquetar para todas las plataformas
npm run package:all
```

## Configuración Específica por Plataforma

### Windows

#### Características Específicas
- Integración con Windows Event Log
- Monitoreo del registro de Windows
- Colectores WMI para métricas del sistema
- Soporte para servicios de Windows

#### Dependencias Adicionales
```json
{
  "dependencies": {
    "node-windows": "^1.0.0-beta.8",
    "wmi-client": "^0.5.0"
  }
}
```

#### Compilación con Permisos Administrativos
```bash
# El agente Windows requiere permisos elevados para:
# - Acceder a Event Logs de seguridad
# - Monitorear el registro del sistema
# - Interactuar con servicios del sistema
```

### Linux

#### Características Específicas
- Integración con systemd journal
- Monitoreo de cambios en filesystem vía inotify
- Colector de procesos vía /proc
- Monitoreo de módulos del kernel

#### Dependencias del Sistema
```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3-dev

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install python3-devel
```

### macOS

#### Características Específicas
- Integración con Console.app logs
- Framework de Endpoint Security (requiere entitlements)
- Monitoreo de LaunchDaemons

#### Configuración de Entitlements
```xml
<!-- soc-agent.entitlements -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.endpoint-security.client</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
</dict>
</plist>
```

## Testing de Builds

### Testing Local

```bash
# Test compilación simple
npm run build
node dist/main-simple.cjs --config test-config.yaml --log-level debug

# Test compilación Windows (solo en Windows)
npm run test:windows
```

### Configuración de Test

```yaml
# test-config.yaml
serverUrl: "https://test-soc.example.com"
organizationKey: "test-key-123"
logLevel: "debug"
dataUploadInterval: 30
enabledCollectors:
  - "process"
  - "filesystem"
capabilities:
  fileSystemMonitoring: true
  processMonitoring: true
  networkMonitoring: false
```

### Validación de Binarios

```bash
# Verificar que el binario funciona
./dist/agents/soc-agent-linux --version

# Test de integridad
sha256sum dist/agents/soc-agent-linux
```

## Distribución y Despliegue

### Servidor de Distribución

El sistema incluye un builder automático en `server/integrations/agent-builder.js`:

```javascript
export class AgentBuilder {
  // Compila agente para plataforma específica
  async compileAgent(outputDir, os) {
    // Copiar código fuente
    await exec(`cp -r ${path.join(this.templatesDir, 'common')} ${outputDir}/`);
    await exec(`cp -r ${path.join(this.templatesDir, os.toString())} ${outputDir}/`);
    
    // Crear punto de entrada personalizado
    const agentEntryPoint = this.generateEntryPoint(os);
    
    // Compilar y empaquetar
    await this.compileAndPackage(outputDir, os);
  }
  
  // Genera configuración para el agente
  generateAgentConfig(config, agentId) {
    return {
      serverUrl: config.serverUrl,
      registrationKey: config.registrationKey,
      agentId: agentId,
      capabilities: this.resolveCapabilities(config),
      collectors: this.getCollectorsForPlatform(config.os)
    };
  }
}
```

### Proceso de Distribución

#### 1. Build Automático por Solicitud
```javascript
// Cuando un usuario solicita un agente
const agentPackage = await buildAgentPackage(
  userId,
  'windows',     // Sistema operativo
  serverUrl,
  registrationKey,
  'Agent-PC-001', // Nombre personalizado
  capabilities
);
```

#### 2. Personalización por Organización
- Configuración específica de la organización
- Claves de registro únicas
- Capacidades según el plan de servicio
- Colectores habilitados según políticas

#### 3. Descarga Segura
- URLs de descarga con token temporal
- Verificación de permisos del usuario
- Logging de descargas para auditoría

## CI/CD Pipeline

### GitHub Actions Example

```yaml
# .github/workflows/build-agents.yml
name: Build Agents

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd agents
        npm ci
        
    - name: Build Linux agent
      run: |
        cd agents
        npm run build
        npm run package:linux
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: linux-agent
        path: dist/agents/soc-agent-linux*

  build-windows:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd agents
        npm ci
        
    - name: Build Windows agent
      run: |
        cd agents
        npm run build:windows
        npm run package:windows
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: windows-agent
        path: dist/agents/soc-agent-windows.exe

  build-macos:
    runs-on: macos-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd agents
        npm ci
        
    - name: Build macOS agent
      run: |
        cd agents
        npm run build
        npm run package:macos
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: macos-agent
        path: dist/agents/soc-agent-macos*
```

## Troubleshooting

### Problemas Comunes

#### 1. Error de Compilación TypeScript
```bash
# Error: Module not found
# Solución: Verificar imports y dependencias
npm install
npm run build
```

#### 2. Error PKG - Archivos Faltantes
```bash
# Error: Cannot resolve asset
# Solución: Verificar configuración pkg.assets
```

#### 3. Permisos en Linux/macOS
```bash
# Error: Permission denied
# Solución: Establecer permisos ejecutables
chmod +x dist/agents/soc-agent-linux
```

#### 4. Dependencias Nativas
```bash
# Error: Module was compiled against different version
# Solución: Recompilar dependencias nativas
npm rebuild
```

### Logs de Debugging

```bash
# Habilitar logs detallados durante build
DEBUG=pkg:* npm run package:linux

# Verificar dependencias del binario
ldd dist/agents/soc-agent-linux
```

## Optimización de Build

### Reducción de Tamaño de Binarios

```javascript
// pkg.config.js - Configuración avanzada PKG
module.exports = {
  // Excluir módulos innecesarios
  ignore: [
    'test/**',
    '*.test.js',
    'docs/**',
    'examples/**'
  ],
  
  // Comprimir binarios
  compress: true,
  
  // Optimizar para tamaño
  optimize: true
};
```

### Cache de Compilación

```bash
# Usar cache de TypeScript
npm install --global @typescript/ts-node
export TS_NODE_COMPILER_OPTIONS='{"incremental": true}'
```

Esta documentación cubre todo el proceso de compilación y despliegue de agentes, desde el desarrollo hasta la distribución final.