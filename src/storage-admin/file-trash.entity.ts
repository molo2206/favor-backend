// src/storage-admin/file-trash.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ✅ Corbeille des fichiers supprimés (gestionnaire de fichiers, purge des rejetés, orphelins).
 * Les fichiers sont déplacés dans FILE_TRASH_PATH (dossier PRIVÉ, non servi par Apache)
 * et restaurables jusqu'à expiresAt (FILE_TRASH_DAYS, 30 jours par défaut).
 */
@Entity('file_trash')
@Index('idx_file_trash_created', ['createdAt'])
@Index('idx_file_trash_expires', ['expiresAt'])
export class FileTrash {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Racine d'origine (storage, legacy…) */
  @Column({ type: 'varchar', length: 30 })
  rootId: string;

  /** Chemin d'origine, relatif à la racine */
  @Column({ type: 'varchar', length: 700 })
  originalPath: string;

  /** Chemin dans la corbeille, relatif à FILE_TRASH_PATH */
  @Column({ type: 'varchar', length: 700 })
  trashPath: string;

  @Column({ default: false })
  isDirectory: boolean;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: string;

  /** MANUAL | REJECTED_PRODUCT | REJECTED_COMPANY | ORPHAN */
  @Column({ type: 'varchar', length: 30, default: 'MANUAL' })
  reason: string;

  /** Ex. « Produit : Chaussures Nike (id) » */
  @Column({ type: 'varchar', length: 300, nullable: true })
  context?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  deletedById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  deletedByName?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;
}
