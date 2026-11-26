// src/backup/entities/backup-database.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Base de données MySQL à sauvegarder.
 *  - useAppCredentials = true : mêmes identifiants que l'application (.env), rien n'est stocké en base.
 *  - sinon hôte / port / utilisateur / mot de passe (chiffré AES-256-GCM, jamais renvoyé par l'API).
 * Chaque programmation et chaque sauvegarde est liée à une de ces bases.
 */
@Entity('backup_databases')
@Index('idx_backup_databases_active', ['isActive'])
export class BackupDatabase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nom affiché (ex. « Base principale », « Base F-Pay ») */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** Utiliser les identifiants MySQL de l'application (.env) */
  @Column({ default: false })
  useAppCredentials: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  host?: string | null;

  @Column({ type: 'int', nullable: true })
  port?: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username?: string | null;

  /** Mot de passe chiffré (v1:iv:tag:données) — jamais renvoyé */
  @Column({ type: 'text', nullable: true, select: false })
  passwordEnc?: string | null;

  /** Nom de la base MySQL (ex. favor_db) */
  @Column({ type: 'varchar', length: 64 })
  databaseName: string;

  /** Tables à exclure du dump (ex. journaux volumineux) */
  @Column('simple-json', { nullable: true })
  excludeTables?: string[] | null;

  /** Base utilisée quand aucune base n'est précisée */
  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isActive: boolean;

  // ---------- Dernier test de connexion ----------
  @Column({ type: 'datetime', nullable: true })
  lastTestAt?: Date | null;

  @Column({ type: 'boolean', nullable: true })
  lastTestOk?: boolean | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  lastTestError?: string | null;

  /** Version MySQL / MariaDB détectée */
  @Column({ type: 'varchar', length: 100, nullable: true })
  serverVersion?: string | null;

  // ---------- Dernière sauvegarde ----------
  @Column({ type: 'datetime', nullable: true })
  lastBackupAt?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  lastBackupStatus?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
