/**
 * Cola FIFO con back-pressure para eventos de agente
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';
import { AgentEvent } from '../collectors/types';

interface QueueOptions {
  maxSize: number; // Tamaño máximo de la cola en memoria
  persistPath?: string; // Ruta para persistir eventos cuando la cola está llena
}

/**
 * Implementación de cola FIFO con persistencia SQLite
 */
export class EventQueue {
  private inMemoryQueue: AgentEvent[] = [];
  private db: any | null = null;
  private options: QueueOptions;
  private isInitialized = false;

  constructor(options: QueueOptions) {
    this.options = options;
  }

  /**
   * Inicializa la cola y la base de datos si es necesario
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Si se especificó una ruta para persistencia, inicializar SQLite
    if (this.options.persistPath) {
      try {
        // Asegurar que el directorio existe
        const directory = path.dirname(this.options.persistPath);
        await fs.mkdir(directory, { recursive: true });

        // Inicializar la base de datos
        this.db = new Database(this.options.persistPath);
        
        // Crear tabla de eventos si no existe
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          )
        `);
        
        console.log(`Event queue initialized with persistence at ${this.options.persistPath}`);
      } catch (error) {
        console.error('Error initializing SQLite persistence:', error);
        this.db = null;
      }
    }

    this.isInitialized = true;
  }

  /**
   * Añade un evento a la cola
   */
  async push(event: AgentEvent): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Si la cola en memoria no está llena, añadir a memoria
    if (this.inMemoryQueue.length < this.options.maxSize) {
      this.inMemoryQueue.push(event);
      return;
    }
    
    // Si la cola está llena y hay persistencia, guardar en SQLite
    if (this.db) {
      try {
        const stmt = this.db.prepare('INSERT INTO events (event, timestamp) VALUES (?, ?)');
        stmt.run(JSON.stringify(event), Date.now());
      } catch (error) {
        console.error('Error persisting event to SQLite:', error);
        // Si hay error en SQLite, eliminar el evento más antiguo y añadir el nuevo en memoria
        this.inMemoryQueue.shift();
        this.inMemoryQueue.push(event);
      }
    } else {
      // Si no hay persistencia, eliminar el evento más antiguo y añadir el nuevo
      this.inMemoryQueue.shift();
      this.inMemoryQueue.push(event);
      console.warn('Event queue is full and no persistence available, dropping oldest event');
    }
  }

  /**
   * Obtiene y elimina eventos de la cola (hasta un máximo especificado)
   */
  async pop(maxEvents: number = 100): Promise<AgentEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Si no hay eventos en memoria ni en base de datos, devolver array vacío
    if (this.inMemoryQueue.length === 0 && (!this.db || !this.hasPersistentEvents())) {
      return [];
    }

    // Obtener eventos de memoria
    let result = this.inMemoryQueue.slice(0, maxEvents);
    this.inMemoryQueue = this.inMemoryQueue.slice(result.length);

    // Si no se alcanzó el máximo y hay eventos persistidos, obtener de SQLite
    if (result.length < maxEvents && this.db && this.hasPersistentEvents()) {
      const remaining = maxEvents - result.length;
      try {
        const rows = this.db.prepare(`
          SELECT id, event FROM events 
          ORDER BY timestamp ASC 
          LIMIT ?
        `).all(remaining);

        if (rows.length > 0) {
          // Añadir eventos de la base de datos al resultado
          const dbEvents = rows.map((row: any) => JSON.parse(row.event) as AgentEvent);
          result = [...result, ...dbEvents];

          // Eliminar eventos recuperados de la base de datos
          const ids = rows.map((row: any) => row.id).join(',');
          this.db.prepare(`DELETE FROM events WHERE id IN (${ids})`).run();
        }
      } catch (error) {
        console.error('Error retrieving events from SQLite:', error);
      }
    }

    return result;
  }

  /**
   * Comprueba si hay eventos en la cola
   */
  async isEmpty(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.inMemoryQueue.length === 0 && (!this.db || !this.hasPersistentEvents());
  }

  /**
   * Obtiene el número total de eventos en la cola (memoria + persistencia)
   */
  async size(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let persistentCount = 0;
    if (this.db) {
      try {
        const result = this.db.prepare('SELECT COUNT(*) as count FROM events').get();
        persistentCount = result.count;
      } catch (error) {
        console.error('Error counting events in SQLite:', error);
      }
    }

    return this.inMemoryQueue.length + persistentCount;
  }

  /**
   * Comprueba si hay eventos persistidos en SQLite
   */
  private hasPersistentEvents(): boolean {
    if (!this.db) return false;
    
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM events').get();
      return result.count > 0;
    } catch (error) {
      console.error('Error checking for persistent events:', error);
      return false;
    }
  }

  /**
   * Cierra la conexión a la base de datos
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.error('Error closing SQLite database:', error);
      }
      this.db = null;
    }
  }
}