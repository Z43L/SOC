/**
 * Test básico para los colectores de Windows
 */

import { windowsCollectors } from './collectors/windows';
import { Logger } from './core/logger';

// Crear logger simple para testing
const logger = new Logger({
  level: 'info',
  enableConsole: true
});

/**
 * Función para probar los colectores de Windows
 */
async function testWindowsCollectors() {
  console.log('=== Testing Windows Collectors ===');
  
  // Verificar que estamos en una plataforma compatible (simulado)
  const platform = process.platform;
  console.log(`Current platform: ${platform}`);
  
  if (platform !== 'win32') {
    console.log('WARNING: Not running on Windows, some tests may fail');
  }
  
  // Contador de eventos recibidos
  let eventCount = 0;
  
  // Callback para manejar eventos
  const handleEvent = (event: any) => {
    eventCount++;
    console.log(`Event ${eventCount}: ${event.eventType} - ${event.severity} - ${event.message}`);
  };
  
  // Probar cada colector
  for (const collector of windowsCollectors) {
    console.log(`\n--- Testing ${collector.name} ---`);
    console.log(`Description: ${collector.description}`);
    console.log(`Compatible systems: ${collector.compatibleSystems.join(', ')}`);
    
    try {
      // Configurar el colector
      if (collector.configure) {
        await collector.configure({
          eventCallback: handleEvent,
          logger: logger
        });
        console.log(`✓ Configured ${collector.name}`);
      }
      
      // Probar que se puede iniciar
      console.log(`Starting ${collector.name}...`);
      const startResult = await collector.start();
      
      if (startResult) {
        console.log(`✓ Started ${collector.name} successfully`);
        
        // Esperar un poco para que genere eventos
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Detener el colector
        const stopResult = await collector.stop();
        if (stopResult) {
          console.log(`✓ Stopped ${collector.name} successfully`);
        } else {
          console.log(`✗ Failed to stop ${collector.name}`);
        }
      } else {
        console.log(`✗ Failed to start ${collector.name}`);
      }
      
    } catch (error) {
      console.log(`✗ Error testing ${collector.name}:`, error);
    }
  }
  
  console.log(`\n=== Test Completed ===`);
  console.log(`Total events generated: ${eventCount}`);
}

// Ejecutar test si este archivo es ejecutado directamente
if (require.main === module) {
  testWindowsCollectors().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export { testWindowsCollectors };