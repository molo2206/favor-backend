// src/backup/backup.service.ts
import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly dbConfig = {
    username: 'root',
    password: '',
    database: 'favor_db1',
    host: 'localhost',
    port: 3306,
  };

  // Chemins communs pour mysqldump sur Windows
  private readonly possibleMysqldumpPaths = [
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe',
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'mysqldump' // Essayer sans chemin si dans le PATH
  ];

  private findMysqldumpPath(): string {
    for (const possiblePath of this.possibleMysqldumpPaths) {
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
    }
    throw new Error('mysqldump non trouvé. Veuillez installer MySQL ou ajouter mysqldump au PATH.');
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.sql`;
    const backupPath = path.join(process.cwd(), 'backups', backupFileName);

    // Créer le dossier backups s'il n'existe pas
    const backupsDir = path.dirname(backupPath);
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    try {
      const mysqldumpPath = this.findMysqldumpPath();
      
      // Commande MySQL avec chemin complet
      const command = `"${mysqldumpPath}" -h ${this.dbConfig.host} -P ${this.dbConfig.port} -u ${this.dbConfig.username} ${this.dbConfig.password ? `-p${this.dbConfig.password}` : ''} ${this.dbConfig.database} > "${backupPath}"`;

      await execAsync(command);

      return `Backup créé avec succès: ${backupFileName}`;
    } catch (error) {
      throw new Error(`Erreur lors du backup: ${error.message}`);
    }
  }

  async restoreBackup(backupFileName: string): Promise<string> {
    const backupPath = path.join(process.cwd(), 'backups', backupFileName);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Fichier de backup non trouvé');
    }

    try {
      // Chercher le chemin de mysql de la même manière
      const mysqlPath = this.findMysqlPath();
      
      const command = `"${mysqlPath}" -h ${this.dbConfig.host} -P ${this.dbConfig.port} -u ${this.dbConfig.username} ${this.dbConfig.password ? `-p${this.dbConfig.password}` : ''} ${this.dbConfig.database} < "${backupPath}"`;

      await execAsync(command);

      return `Backup restauré avec succès: ${backupFileName}`;
    } catch (error) {
      throw new Error(`Erreur lors de la restauration: ${error.message}`);
    }
  }

  private findMysqlPath(): string {
    const possibleMysqlPaths = [
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
      'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysql.exe',
      'C:\\xampp\\mysql\\bin\\mysql.exe',
      'mysql'
    ];

    for (const possiblePath of possibleMysqlPaths) {
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
    }
    throw new Error('mysql non trouvé. Veuillez installer MySQL ou ajouter mysql au PATH.');
  }

  listBackups(): string[] {
    const backupsDir = path.join(process.cwd(), 'backups');

    if (!fs.existsSync(backupsDir)) {
      return [];
    }

    return fs
      .readdirSync(backupsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .reverse();
  }
}