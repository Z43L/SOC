/**
 * Punto de entrada para el agente de SOC-Inteligente para Linux
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LinuxAgent } from './linux-agent';

// Configuración predeterminada para el archivo de configuración
const DEFAULT_CONFIG_PATH = '/etc/soc-agent/config.json';

/**
 * Imprime un mensaje de ayuda
 */
function printHelp() {
  console.log(`
SOC-Inteligente - Agente para Linux
-----------------------------------

Este agente recopila información de seguridad del sistema Linux y la
envía al servidor de SOC-Inteligente para análisis y detección de amenazas.

Uso:
  node index.js [opciones]

Opciones:
  --config <ruta>     Ruta al archivo de configuración (predeterminado: ${DEFAULT_CONFIG_PATH})
  --register          Solo registra el agente con el servidor y termina
  --scan              Ejecuta un único escaneo y termina
  --daemon            Ejecuta el agente como servicio en segundo plano
  --help              Muestra esta ayuda
  
Ejemplos:
  node index.js --config /ruta/personalizada/config.json
  node index.js --register
  node index.js --scan
  node index.js --daemon

Para más información, visite: https://soc-inteligente.example.com/docs/agent
`);
}

/**
 * Verifica si el archivo de configuración existe
 */
async function checkConfigPath(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Crea el archivo de configuración con los valores predeterminados
 */
async function createDefaultConfig(configPath: string): Promise<void> {
  // Asegurarse de que el directorio exista
  const configDir = path.dirname(configPath);
  
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    console.error(`No se pudo crear el directorio de configuración: ${configDir}`);
    throw error;
  }
  
  // Configuración predeterminada
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

/**
 * Función principal
 */
async function main() {
  // Analizar argumentos de línea de comandos
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
  
  // Verificar si el archivo de configuración existe
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
    console.log(`Iniciando agente SOC-Inteligente desde: ${configPath}`);
    const agent = new LinuxAgent(configPath);
    
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
      
      // Desligar del proceso principal
      // En un entorno de producción, aquí utilizaríamos un enfoque más robusto
      // con herramientas como PM2 o systemd para gestionar el proceso demonio.
      // Este es un ejemplo simplificado.
      
      // En producción, no dependemos de process.stdout y process.stderr ya que podrían
      // no estar disponibles en un entorno demonio real
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

// Ejecutar el programa principal
main().catch(error => {
  console.error('Error no controlado:', error);
  process.exit(1);
});