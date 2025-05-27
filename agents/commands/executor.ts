/**
 * Ejecutor de comandos push
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Tipos de comandos soportados
export type CommandType = 'script' | 'configUpdate' | 'isolate' | 'upgrade';

// Resultado de la ejecución de un comando
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// Opciones de configuración para el ejecutor
export interface CommandExecutorOptions {
  allowedCommands: CommandType[];
  tempDir?: string;
  maxExecutionTime?: number; // en milisegundos
}

/**
 * Clase para ejecutar comandos push desde el servidor
 */
export class CommandExecutor {
  private options: CommandExecutorOptions;
  
  constructor(options: CommandExecutorOptions) {
    this.options = {
      ...options,
      tempDir: options.tempDir || os.tmpdir(),
      maxExecutionTime: options.maxExecutionTime || 60000 // 1 minuto por defecto
    };
  }
  
  /**
   * Ejecuta un comando de script
   */
  async executeScript(params: {
    script: string;
    args?: string[];
    interpreter?: string;
  }): Promise<CommandResult> {
    if (!this.isCommandAllowed('script')) {
      return this.errorResult('Script execution is not allowed');
    }
    
    try {
      const tempFile = path.join(this.options.tempDir || os.tmpdir(), `script_${Date.now()}.sh`);
      
      // Escribir script a archivo temporal
      await fs.writeFile(tempFile, params.script, { mode: 0o700 });
      
      // Determinar intérprete
      const interpreter = params.interpreter || '/bin/bash';
      
      // Ejecutar script
      const result = await this.executeCommand(interpreter, [tempFile, ...(params.args || [])]);
      
      // Limpiar archivo temporal
      await fs.unlink(tempFile).catch(() => {});
      
      return result;
    } catch (error) {
      return this.errorResult(`Error executing script: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Actualiza la configuración del agente
   */
  async executeConfigUpdate(params: {
    configPath: string;
    configData: string | object;
  }): Promise<CommandResult> {
    if (!this.isCommandAllowed('configUpdate')) {
      return this.errorResult('Configuration update is not allowed');
    }
    
    try {
      // Convertir objeto a string si es necesario
      const configString = typeof params.configData === 'string'
        ? params.configData
        : JSON.stringify(params.configData, null, 2);
      
      // Escribir nueva configuración
      await fs.writeFile(params.configPath, configString);
      
      return {
        stdout: `Configuration updated successfully at ${params.configPath}`,
        stderr: '',
        exitCode: 0,
        durationMs: 0
      };
    } catch (error) {
      return this.errorResult(`Error updating configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Aísla el host de la red (solo disponible en Linux)
   */
  async executeIsolate(params: {
    enable: boolean;
    allowOutbound?: boolean;
    allowInbound?: boolean;
    allowLocalOnly?: boolean;
  }): Promise<CommandResult> {
    if (!this.isCommandAllowed('isolate')) {
      return this.errorResult('Host isolation is not allowed');
    }
    
    // Solo soportado en Linux
    if (os.platform() !== 'linux') {
      return this.errorResult('Host isolation is only supported on Linux');
    }
    
    try {
      if (params.enable) {
        // Activar aislamiento
        if (params.allowLocalOnly) {
          // Permitir solo tráfico local
          await this.executeCommand('iptables', ['-F']);
          await this.executeCommand('iptables', ['-A', 'INPUT', '-i', 'lo', '-j', 'ACCEPT']);
          await this.executeCommand('iptables', ['-A', 'OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
          await this.executeCommand('iptables', ['-P', 'INPUT', 'DROP']);
          await this.executeCommand('iptables', ['-P', 'OUTPUT', 'DROP']);
          await this.executeCommand('iptables', ['-P', 'FORWARD', 'DROP']);
        } else {
          // Configuración personalizada
          await this.executeCommand('iptables', ['-F']);
          
          // Permitir tráfico de entrada si está habilitado
          if (params.allowInbound) {
            await this.executeCommand('iptables', ['-P', 'INPUT', 'ACCEPT']);
          } else {
            await this.executeCommand('iptables', ['-P', 'INPUT', 'DROP']);
          }
          
          // Permitir tráfico de salida si está habilitado
          if (params.allowOutbound) {
            await this.executeCommand('iptables', ['-P', 'OUTPUT', 'ACCEPT']);
          } else {
            await this.executeCommand('iptables', ['-P', 'OUTPUT', 'DROP']);
          }
          
          // Bloquear forwarding
          await this.executeCommand('iptables', ['-P', 'FORWARD', 'DROP']);
        }
        
        return {
          stdout: `Host isolation ${params.allowLocalOnly ? 'with local traffic only' : ''} enabled successfully`,
          stderr: '',
          exitCode: 0,
          durationMs: 0
        };
      } else {
        // Desactivar aislamiento
        await this.executeCommand('iptables', ['-F']);
        await this.executeCommand('iptables', ['-P', 'INPUT', 'ACCEPT']);
        await this.executeCommand('iptables', ['-P', 'OUTPUT', 'ACCEPT']);
        await this.executeCommand('iptables', ['-P', 'FORWARD', 'ACCEPT']);
        
        return {
          stdout: 'Host isolation disabled successfully',
          stderr: '',
          exitCode: 0,
          durationMs: 0
        };
      }
    } catch (error) {
      return this.errorResult(`Error executing isolation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Ejecuta un comando de sistema
   */
  private async executeCommand(
    command: string,
    args: string[] = [],
    timeout: number = this.options.maxExecutionTime || 60000
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      // Iniciar temporizador
      const startTime = Date.now();
      
      // Temporizador para timeout
      let timeoutId: NodeJS.Timeout | null = null;
      
      // Buffers para stdout y stderr
      const stdout: string[] = [];
      const stderr: string[] = [];
      
      // Iniciar proceso
      const process = spawn(command, args);
      
      // Configurar timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          process.kill('SIGTERM');
          stderr.push(`Command execution timed out after ${timeout}ms`);
        }, timeout);
      }
      
      // Capturar salida estándar
      process.stdout.on('data', (data) => {
        stdout.push(data.toString());
      });
      
      // Capturar errores
      process.stderr.on('data', (data) => {
        stderr.push(data.toString());
      });
      
      // Manejar finalización
      process.on('close', (code) => {
        // Cancelar timeout si existe
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        
        // Calcular duración
        const durationMs = Date.now() - startTime;
        
        resolve({
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          exitCode: code !== null ? code : -1,
          durationMs
        });
      });
      
      // Manejar errores
      process.on('error', (error) => {
        // Cancelar timeout si existe
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        
        // Calcular duración
        const durationMs = Date.now() - startTime;
        
        resolve({
          stdout: stdout.join(''),
          stderr: `Error executing command: ${error.message}`,
          exitCode: -1,
          durationMs
        });
      });
    });
  }
  
  /**
   * Verifica si un tipo de comando está permitido
   */
  private isCommandAllowed(commandType: CommandType): boolean {
    return this.options.allowedCommands.includes(commandType);
  }
  
  /**
   * Crea un resultado de error
   */
  private errorResult(message: string): CommandResult {
    return {
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0
    };
  }
}