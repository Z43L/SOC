# Guía de Compilación Manual de Agentes

Esta guía describe cómo compilar desde el código fuente los agentes de SOC-Inteligente descargados de la plataforma.

## Prerrequisitos

- Node.js 18 o superior
- Herramientas de compilación estándar (tar, unzip)
- Acceso al paquete de código fuente generado por la plataforma (`*.tar.gz`)

## Pasos de compilación

1. **Extraer el paquete**
   ```bash
   tar -xzf soc-agent-source-<os>-<id>.tar.gz
   cd source
   ```
2. **Instalar dependencias**
   ```bash
   npm install
   ```
3. **Compilar el agente**
   ```bash
   # Reemplazar <os> por windows, linux o macos según corresponda
   npm run build:<os>
   ```
4. **Ejecutar el agente**
   ```bash
   # Para Linux y macOS
   node dist/main-simple.cjs

   # Para Windows
   node dist/main-windows.js
   ```

El archivo `agent-config.json` incluido en el paquete contiene la configuración generada por la plataforma. Puede modificarse antes de iniciar el agente si es necesario.

## Actualización manual

Para actualizar el agente repita los pasos anteriores con un paquete actualizado.
