// src/backOffice/hr/signatures/employee-signature.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Signature manuscrite d'un EMPLOYÉ (fiche hr_employees), une par employé.
 *    Apposée sur les documents qu'il signe (états de besoins : soumission, validation, autorisation, décaissement…).
 *    Les anciennes images ne sont pas supprimées : les documents déjà signés gardent leur signature.
 */
@Entity('hr_employee_signatures')
@Index('uq_hr_employee_signature', ['employeeId'], { unique: true })
@Index('idx_hr_employee_signature_user', ['userId', 'companyId'])
export class EmployeeSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Employé (hr_employees.id) */
  @Column({ type: 'varchar', length: 36 })
  employeeId: string;

  /** Entreprise de l'employé */
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  /** Compte utilisateur lié à l'employé (hr_employees.userId), pour retrouver la signature à la connexion */
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

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
