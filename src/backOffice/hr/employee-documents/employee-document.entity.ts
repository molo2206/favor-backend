// src/backOffice/hr/employee-documents/employee-document.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Types de dossiers d'un employé */
export const EMPLOYEE_DOCUMENT_CATEGORIES = [
  'CV', // curriculum vitae
  'ID_CARD', // carte d'identité / carte d'électeur
  'PASSPORT',
  'DIPLOMA', // diplômes, attestations de formation
  'CONTRACT', // contrat de travail, avenants
  'CERTIFICATE', // certificats (travail, aptitude…)
  'MEDICAL', // certificat médical, aptitude
  'CRIMINAL_RECORD', // extrait de casier judiciaire
  'BANK', // RIB, informations bancaires
  'PHOTO',
  'DRIVING_LICENSE',
  'OTHER',
] as const;
export type EmployeeDocumentCategory = (typeof EMPLOYEE_DOCUMENT_CATEGORIES)[number];

/**
 * ✅ Dossier (pièce jointe) d'un employé : CV, pièce d'identité, diplômes, contrat…
 *    Les fichiers sont stockés HORS du dossier public (HR_DOCUMENTS_PATH) :
 *    ils ne sont accessibles que par la route de téléchargement protégée.
 */
@Entity('hr_employee_documents')
@Index('idx_hr_emp_doc_employee', ['employeeId', 'category'])
@Index('idx_hr_emp_doc_company_exp', ['companyId', 'expiresAt'])
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  employeeId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @Column({ type: 'varchar', length: 30, default: 'OTHER' })
  category: EmployeeDocumentCategory;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  /** Numéro du document (n° de carte, de passeport, de diplôme…) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  documentNumber?: string | null;

  @Column({ type: 'date', nullable: true })
  issuedAt?: string | null;

  /** Date d'expiration (pièce d'identité, visa, permis, certificat médical…) */
  @Column({ type: 'date', nullable: true })
  expiresAt?: string | null;

  /** Chemin relatif dans HR_DOCUMENTS_PATH */
  @Column({ type: 'varchar', length: 300 })
  storagePath: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadedById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  uploadedByName?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
