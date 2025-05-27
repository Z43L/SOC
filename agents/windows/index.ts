/**
 * Punto de entrada para el agente de SOC-Inteligente para Windows
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WindowsAgent } from './windows-agent';

// Configuración predeterminada para el archivo de configuración
const DEFAULT_CONFIG_PATH = process.env.ProgramData 
  ? path.join(process.env.ProgramData, 'SOC-Agent', 'config.json')
  : path.join('C:\\ProgramData', 'SOC-Agent', 'config.json');

function printHelp() {
  console.log(`\nSOC-Inteligente - Agente para Windows\n-----------------------------\n\nEste agente recopila información de seguridad del sistema Windows y la\nenvía al servidor de SOC-Inteligente para análisis y detección de amenazas.\n\nUso:\n  node index.js [opciones]\n\nOpciones:\n  --config <ruta>     Ruta al archivo de configuración (predeterminado: ${DEFAULT_CONFIG_PATH})\n  --register          Solo registra el agente con el servidor y termina\n  --scan              Ejecuta un único escaneo y termina\n  --daemon            Ejecuta el agente como servicio en segundo plano\n  --help              Muestra esta ayuda\n\nEjemplos:\n  node index.js --config C:\\ruta\\personalizada\\config.json\n  node index.js --register\n  node index.js --scan\n  node index.js --daemon\n`);
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
      registryMonitoring: true, // Habilitado por defecto en Windows
      securityLogsMonitoring: true,
      malwareScanning: true,
      vulnerabilityScanning: true
    },
    logFilePath: 'C:\\Logs\\soc-agent.log',
    maxStorageSize: 100,
    logLevel: 'info',
    directoriesToScan: [
      'C:\\Windows\\Temp',
      'C:\\Temp',
      'C:\\Users\\Public',
      os.tmpdir()
    ]
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

/**
 * Función principal
 */
async function main() {
  const args = process.argv.slice(2);
  let configPath = DEFAULT_CONFIG_PATH;
  let registerOnly = false;
  let scanOnly = false;
  let daemonMode = false;

  // Procesar argumentos de línea de comandos
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

  // Verificar si existe el archivo de configuración
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
    // Crear e inicializar el agente
    console.log(`Iniciando agente SOC-Inteligente (Windows) desde: ${configPath}`);
    const agent = new WindowsAgent(configPath);
    
    // Inicializar el agente (cargará configuración y se registrará si es necesario)
    const initialized = await agent.initialize();
    
    if (!initialized) {
      console.error('Error al inicializar el agente. Saliendo...');
      return;
    }
    
    // Si solo registramos, terminar aquí
    if (registerOnly) {
      console.log('Registro completado. Saliendo...');
      return;
    }
    
    // Iniciar el agente
    const started = await agent.start();
    
    if (!started) {
      console.error('Error al iniciar el agente. Saliendo...');
      return;
    }
    
    // Si solo escaneamos, detener después del escaneo inicial
    if (scanOnly) {
      console.log('Escaneo completado. Deteniendo agente...');
      await agent.stop();
      return;
    }
    
    // Iniciar como daemon (servicio en segundo plano)
    if (daemonMode) {
      console.log('Ejecutando en modo daemon...');
      
      // En producción, en Windows esto sería configurado como un servicio Windows
      // mediante Windows Service Manager, no a través de Node.js directamente.
      // Este es un ejemplo simplificado.
      
      // En producción, no dependemos de process.stdout y process.stderr ya que podrían
      // no estar disponibles en un entorno servicio real
      console.log('Agente en ejecución. Logs disponibles en el archivo de registro configurado.');
    } else {
      console.log('Agente en ejecución. Presiona Ctrl+C para detener.');
    }
    
    // Manejar señales para terminar de manera limpia
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

// Ejecutar función principal
main().catch(error => {
  console.error('Error no controlado:', error);
  process.exit(1);
});