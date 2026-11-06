// src/user-signatures/user-signature.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Signature manuscrite d'un utilisateur / employé (image).
 *    Une signature par utilisateur ; elle est apposée sur les documents qu'il signe
 *    (états de besoins : soumission, validation, autorisation, décaissement…).
 *    Les anciennes images ne sont pas supprimées : les documents déjà signés gardent leur signature.
 */
@Entity('user_signatures')
@Index('uq_user_signature_user', ['userId'], { unique: true })
export class UserSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  imageUrl: string;

  /** Chemin relatif dans UPLOAD_PATH (ex. signatures/abc.webp) */
  @Column({ type: 'varchar', length: 300 })
  storagePath: string;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  @Column({ type: 'int', nullable: true })
  sizeBytes?: number | null;

  /** UPLOAD (image envoyée) ou DRAWN (dessinée dans l'application) */
  @Column({ type: 'varchar', length: 10, default: 'UPLOAD' })
  source: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
