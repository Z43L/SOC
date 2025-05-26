/**
 * Punto de entrada para el agente de SOC-Inteligente para macOS
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MacOSAgent } from './macos-agent';

// Configuración predeterminada para el archivo de configuración
const DEFAULT_CONFIG_PATH = '/etc/soc-agent/config.json';

function printHelp() {
  console.log(`\nSOC-Inteligente - Agente para macOS\n-----------------------------\n\nEste agente recopila información de seguridad del sistema macOS y la\nenvía al servidor de SOC-Inteligente para análisis y detección de amenazas.\n\nUso:\n  node index.js [opciones]\n\nOpciones:\n  --config <ruta>     Ruta al archivo de configuración (predeterminado: ${DEFAULT_CONFIG_PATH})\n  --register          Solo registra el agente con el servidor y termina\n  --scan              Ejecuta un único escaneo y termina\n  --daemon            Ejecuta el agente como servicio en segundo plano\n  --help              Muestra esta ayuda\n\nEjemplos:\n  node index.js --config /ruta/personalizada/config.json\n  node index.js --register\n  node index.js --scan\n  node index.js --daemon\n`);
}

async function checkConfigPath(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath);
    return true;
  } catch (error) {
    return false;
  }
}

async function createDefaultConfig(configPath: string): Promise<void> {
  const configDir = path.dirname(configPath);
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    console.error(`No se pudo crear el directorio de configuración: ${configDir}`);
    throw error;
  }
  const defaultConfig = {
    serverUrl: 'https://soc.example.com',
    registrationKey: '',
    heartbeatInterval: 60,
    dataUploadInterval: 300,
    scanInterval: 3600,
    registrationEndpoint: '/api/agents/register',
    dataEndpoint: '/api/agents/data',
    heartbeatEndpoint: '/api/agents/heartbeat',
    signMessages: false,
    capabilities: {
      fileSystemMonitoring: true,
      processMonitoring: true,
      networkMonitoring: true,
      registryMonitoring: false,
      securityLogsMonitoring: true,
      malwareScanning: true,
      vulnerabilityScanning: true
    },
    logFilePath: '/var/log/soc-agent.log',
    maxStorageSize: 100,
    logLevel: 'info'
  };
  try {
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Archivo de configuración creado en: ${configPath}`);
    console.log('Por favor, edita el archivo y configura la URL del servidor y la clave de registro.');
  } catch (error) {
    console.error(`No se pudo crear el archivo de configuración: ${configPath}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let configPath = DEFAULT_CONFIG_PATH;
  let registerOnly = false;
  let scanOnly = false;
  let daemonMode = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && i + 1 < args.length) {
      configPath = args[++i];
    } else if (arg === '--register') {
      registerOnly = true;
    } else if (arg === '--scan') {
      scanOnly = true;
    } else if (arg === '--daemon') {
      daemonMode = true;
    } else if (arg === '--help') {
      printHelp();
      return;
    }
  }
  const configExists = await checkConfigPath(configPath);
  if (!configExists) {
    console.log(`El archivo de configuración no existe: ${configPath}`);
    try {
      await createDefaultConfig(configPath);
      console.log('Por favor configura el archivo y vuelve a ejecutar el agente.');
      return;
    } catch (error) {
      console.error('No se pudo crear la configuración predeterminada. Saliendo...');
      return;
    }
  }
  try {
    console.log(`Iniciando agente SOC-Inteligente (macOS) desde: ${configPath}`);
    const agent = new MacOSAgent(configPath);
    const initialized = await agent.initialize();
    if (!initialized) {
      console.error('Error al inicializar el agente. Saliendo...');
      return;
    }
    if (registerOnly) {
      console.log('Registro completado. Saliendo...');
      return;
    }
    const started = await agent.start();
    if (!started) {
      console.error('Error al iniciar el agente. Saliendo...');
      return;
    }
    if (scanOnly) {
      console.log('Escaneo completado. Deteniendo agente...');
      await agent.stop();
      return;
    }
    if (daemonMode) {
      console.log('Ejecutando en modo daemon...');
      console.log('Agente en ejecución. Logs disponibles en el archivo de registro configurado.');
    } else {
      console.log('Agente en ejecución. Presiona Ctrl+C para detener.');
    }
    process.on('SIGINT', async () => {
      console.log('Recibida señal SIGINT. Deteniendo agente...');
      await agent.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      console.log('Recibida señal SIGTERM. Deteniendo agente...');
      await agent.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error fatal en el agente:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error no controlado:', error);
  process.exit(1);
});
