/**
 * Sistema de auto-actualización del agente
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as os from 'os';
import * as child_process from 'child_process';

export interface UpdaterOptions {
  serverUrl: string;
  currentVersion: string;
  binaryPath: string;
  backupPath?: string;
  checksumType?: 'sha256' | 'sha512';
  updateEndpoint?: string;
  restartCommand?: string;
  platform?: string;
  arch?: string;
  // Security options for signature verification
  enableSignatureVerification?: boolean;
  publicKeyPath?: string;
  trustedCertificate?: string;
}

/**
 * Clase para gestionar actualizaciones automáticas del agente
 */
export class Updater {
  private options: UpdaterOptions;
  
  constructor(options: UpdaterOptions) {
    this.options = {
      ...options,
      backupPath: options.backupPath || path.join(path.dirname(options.binaryPath), 'backup'),
      checksumType: options.checksumType || 'sha256',
      updateEndpoint: options.updateEndpoint || '/api/agents/latest',
      platform: options.platform || os.platform(),
      arch: options.arch || os.arch()
    };
  }
  
  /**
   * Comprueba si hay una actualización disponible
   */
  async checkForUpdate(): Promise<{ 
    hasUpdate: boolean; 
    latestVersion?: string; 
    downloadUrl?: string;
    checksum?: string;
  }> {
    try {
      // Construir URL de comprobación
      const url = new URL(this.options.updateEndpoint!, this.options.serverUrl);
      url.searchParams.append('os', this.mapPlatform(this.options.platform!));
      url.searchParams.append('arch', this.mapArch(this.options.arch!));
      url.searchParams.append('version', this.options.currentVersion);
      
      // Realizar petición
      const data = await this.httpRequest(url.toString());
      const updateInfo = JSON.parse(data);
      
      if (!updateInfo.hasUpdate) {
        return { hasUpdate: false };
      }
      
      return {
        hasUpdate: true,
        latestVersion: updateInfo.version,
        downloadUrl: updateInfo.downloadUrl,
        checksum: updateInfo.checksum
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { hasUpdate: false };
    }
  }
  
  /**
   * Descarga y verifica una nueva versión
   */
  async downloadUpdate(downloadUrl: string, checksum: string, signatureUrl?: string): Promise<string> {
    // Crear directorio temporal
    const tmpDir = path.join(os.tmpdir(), `agent-update-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    
    // Descargar nuevo binario
    const downloadPath = path.join(tmpDir, 'agent-new');
    await this.downloadFile(downloadUrl, downloadPath);
    
    // Descargar firma si está disponible
    let signaturePath: string | undefined;
    if (signatureUrl && this.options.enableSignatureVerification) {
      signaturePath = path.join(tmpDir, 'agent-new.sig');
      await this.downloadFile(signatureUrl, signaturePath);
    }
    
    // Verificar checksum
    const fileChecksum = await this.calculateChecksum(downloadPath, this.options.checksumType!);
    
    if (fileChecksum !== checksum) {
      throw new Error(`Checksum verification failed. Expected: ${checksum}, Got: ${fileChecksum}`);
    }
    
    // Verificar firma si está habilitada
    if (signaturePath && this.options.enableSignatureVerification) {
      const isSignatureValid = await this.verifySignature(downloadPath, signaturePath);
      if (!isSignatureValid) {
        throw new Error('Signature verification failed');
      }
    }
    
    // Establecer permisos de ejecución
    await fs.chmod(downloadPath, 0o755);
    
    return downloadPath;
  }
  
  /**
   * Realiza la actualización
   */
  async performUpdate(newBinaryPath: string): Promise<boolean> {
    try {
      // Crear directorio de backup si no existe
      await fs.mkdir(this.options.backupPath!, { recursive: true });
      
      // Respaldar versión actual
      const backupFile = path.join(
        this.options.backupPath!,
        `agent-${this.options.currentVersion}-${Date.now()}`
      );
      
      await fs.copyFile(this.options.binaryPath, backupFile);
      
      // Reemplazar binario
      if (os.platform() === 'win32') {
        // En Windows no podemos reemplazar un binario en uso
        // Copiar a una ubicación temporal y configurar para actualizar en el próximo inicio
        const scriptPath = path.join(os.tmpdir(), 'agent-update.bat');
        
        // Crear script de actualización
        const script = `
          @echo off
          timeout /t 2 /nobreak > nul
          copy /Y "${newBinaryPath}" "${this.options.binaryPath}"
          ${this.options.restartCommand || 'exit /b 0'}
        `;
        
        await fs.writeFile(scriptPath, script);
        
        // Ejecutar script en segundo plano
        child_process.spawn('cmd.exe', ['/c', scriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }).unref();
        
        return true;
      } else {
        // En Linux/macOS podemos crear un symlink o reemplazar directamente
        const isSymlink = await this.isSymlink(this.options.binaryPath);
        
        if (isSymlink) {
          // Si es un symlink, actualizar el enlace
          const realPath = await fs.realpath(this.options.binaryPath);
          const targetDir = path.dirname(realPath);
          const newTarget = path.join(targetDir, `agent-${this.options.currentVersion}`);
          
          // Copiar nuevo binario
          await fs.copyFile(newBinaryPath, newTarget);
          await fs.chmod(newTarget, 0o755);
          
          // Actualizar symlink
          await fs.unlink(this.options.binaryPath);
          await fs.symlink(newTarget, this.options.binaryPath);
        } else {
          // Reemplazar directamente
          await fs.copyFile(newBinaryPath, this.options.binaryPath);
          await fs.chmod(this.options.binaryPath, 0o755);
        }
        
        // Reiniciar servicio si se especificó comando
        if (this.options.restartCommand) {
          child_process.spawn('sh', ['-c', this.options.restartCommand], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        }
        
        return true;
      }
    } catch (error) {
      console.error('Error performing update:', error);
      return false;
    }
  }
  
  /**
   * Realiza rollback a la versión anterior
   */
  async rollback(): Promise<boolean> {
    try {
      // Buscar última copia de seguridad
      const backups = await fs.readdir(this.options.backupPath!);
      
      if (backups.length === 0) {
        throw new Error('No backup files found for rollback');
      }
      
      // Ordenar por fecha (más reciente primero)
      backups.sort().reverse();
      
      const lastBackup = path.join(this.options.backupPath!, backups[0]);
      
      // Restaurar desde backup
      await fs.copyFile(lastBackup, this.options.binaryPath);
      await fs.chmod(this.options.binaryPath, 0o755);
      
      // Reiniciar servicio si se especificó comando
      if (this.options.restartCommand) {
        child_process.spawn('sh', ['-c', this.options.restartCommand], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      
      return true;
    } catch (error) {
      console.error('Error performing rollback:', error);
      return false;
    }
  }
  
  /**
   * Mapea la plataforma de Node.js al formato esperado por el servidor
   */
  private mapPlatform(platform: string): string {
    switch (platform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'darwin';
      case 'linux':
        return 'linux';
      default:
        return platform;
    }
  }
  
  /**
   * Mapea la arquitectura de Node.js al formato esperado por el servidor
   */
  private mapArch(arch: string): string {
    switch (arch) {
      case 'x64':
        return 'amd64';
      case 'arm64':
        return 'arm64';
      case 'arm':
        return 'arm';
      default:
        return arch;
    }
  }
  
  /**
   * Verifica la firma digital del archivo descargado
   */
  private async verifySignature(filePath: string, signaturePath: string): Promise<boolean> {
    if (!this.options.enableSignatureVerification || !this.options.publicKeyPath) {
      return true; // Skip verification if not enabled
    }
    
    try {
      // Read the public key
      const publicKey = await fs.readFile(this.options.publicKeyPath, 'utf8');
      
      // Read the signature
      const signature = await fs.readFile(signaturePath);
      
      // Create a verify instance
      const verify = crypto.createVerify('SHA256');
      
      // Read and update the verify with file content
      const fileContent = await fs.readFile(filePath);
      verify.update(fileContent);
      
      // Verify the signature
      const isValid = verify.verify(publicKey, signature);
      
      return isValid;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }
  
  /**
   * Verifica si una ruta es un enlace simbólico
   */
  private async isSymlink(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.lstat(filePath);
      return stats.isSymbolicLink();
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Calcula el hash de un archivo
   */
  private async calculateChecksum(filePath: string, algorithm: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        const hash = crypto.createHash(algorithm);
        const stream = require('fs').createReadStream(filePath);
        
        stream.on('data', (data: any) => {
          hash.update(data);
        });
        
        stream.on('end', () => {
          resolve(hash.digest('hex'));
        });
        
        stream.on('error', (error: any) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Descarga un archivo de una URL
   */
  private async downloadFile(url: string, destination: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const fileStream = fs.open(destination, 'w').then(fileHandle => {
        const writeStream = fileHandle.createWriteStream();
        
        const httpModule = url.startsWith('https:') ? https : http;
        
        const request = httpModule.get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
            return;
          }
          
          response.pipe(writeStream);
          
          writeStream.on('finish', () => {
            writeStream.close();
            resolve();
          });
        });
        
        request.on('error', (error) => {
          fs.unlink(destination).catch(() => {});
          reject(error);
        });
        
        writeStream.on('error', (error) => {
          fs.unlink(destination).catch(() => {});
          reject(error);
        });
      }).catch(reject);
    });
  }
  
  /**
   * Realiza una petición HTTP/HTTPS
   */
  private async httpRequest(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const httpModule = url.startsWith('https:') ? https : http;
      
      const request = httpModule.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP request failed: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        
        response.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        
        response.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          resolve(responseBody);
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.end();
    });
  }
}