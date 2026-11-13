import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import {
  MediaCrewRole,
  MediaPaymentMethod,
  MediaServiceCategory,
  MediaUnit,
  MediaVendorDocumentType,
  MediaVendorDomain,
  MediaVendorStatus,
  MediaVendorType,
} from '../media.enums';
import { MediaVendorRate } from './media-vendor-rate.entity';

/**
 * ✅ Prestataire externe du service Média : photographe / vidéaste freelance, pilote de drone,
 * monteur, studio, agence, imprimerie… (hors employés RH).
 */
@Entity('bo_media_vendors')
@Unique('uq_bo_media_vendor_code', ['companyId', 'code'])
@Index('idx_bo_media_vendor_company_status', ['companyId', 'status'])
@Index('idx_bo_media_vendor_name', ['companyId', 'name'])
export class MediaVendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** Code interne (PRS-0001…) */
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'enum', enum: MediaVendorType, default: MediaVendorType.INDIVIDUAL })
  type: MediaVendorType;

  /** Nom affiché (personne ou structure) */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** ✅ Photo du prestataire (portrait ou logo de la structure) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  /** Raison sociale (structure) */
  @Column({ type: 'varchar', length: 200, nullable: true })
  legalName?: string | null;

  /** Personne à contacter (structure) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  contactName?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  whatsapp?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country?: string | null;

  /** Compte Favor Help du prestataire (facultatif) : reçoit les notifications de mission */
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity | null;

  // ---------- Domaine d'intervention ----------
  /** Photographe, vidéaste, infographe, graphiste, agence de communication, imprimeur… */
  @Column({ type: 'json', nullable: true })
  domains?: MediaVendorDomain[] | null;

  /** Précision quand le domaine est « OTHER » */
  @Column({ type: 'varchar', length: 150, nullable: true })
  domainOther?: string | null;

  // ---------- Compétences ----------
  /** Familles de prestations (PHOTOGRAPHY, DRONE…) */
  @Column({ type: 'json', nullable: true })
  categories?: MediaServiceCategory[] | null;

  /** Rôles possibles sur une séance (PHOTOGRAPHER, EDITOR…) */
  @Column({ type: 'json', nullable: true })
  roles?: MediaCrewRole[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  specialties?: string | null;

  /** Matériel personnel (ex. « Sony FX3, DJI Mavic 3 ») */
  @Column({ type: 'varchar', length: 500, nullable: true })
  equipment?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  portfolioUrl?: string | null;

  /** { instagram, youtube, facebook, tiktok, website… } */
  @Column({ type: 'json', nullable: true })
  socialLinks?: Record<string, string> | null;

  @Column({ type: 'json', nullable: true })
  languages?: string[] | null;

  // ---------- Tarifs et paiement ----------
  @Column({ type: 'enum', enum: MediaUnit, nullable: true })
  rateUnit?: MediaUnit | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  rateAmount?: number | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: MediaPaymentMethod, nullable: true })
  paymentMethod?: MediaPaymentMethod | null;

  /** Numéro Mobile Money / F-Pay */
  @Column({ type: 'varchar', length: 30, nullable: true })
  mobileMoneyNumber?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  bankAccount?: string | null;

  /** NIF / RCCM / identifiant fiscal */
  @Column({ type: 'varchar', length: 60, nullable: true })
  taxId?: string | null;

  // ---------- Contrat ----------
  @Column({ type: 'boolean', default: false })
  ndaSigned: boolean;

  @Column({ type: 'date', nullable: true })
  contractStartDate?: string | null;

  @Column({ type: 'date', nullable: true })
  contractEndDate?: string | null;

  // ---------- Statut ----------
  @Column({ type: 'enum', enum: MediaVendorStatus, default: MediaVendorStatus.ACTIVE })
  status: MediaVendorStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  statusReason?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  statusChangedAt?: Date | null;

  // ---------- Évaluation (moyenne des missions validées) ----------
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, transformer: decimalNumber })
  rating: number;

  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  /** Observations internes */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** Conditions particulières (acompte, déplacement, délais, droits d'utilisation…) */
  @Column({ type: 'text', nullable: true })
  conditions?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @OneToMany(() => MediaVendorDocument, (d) => d.vendor)
  documents?: MediaVendorDocument[];

  /** ✅ Prestations proposées et leurs tarifs */
  @OneToMany(() => MediaVendorRate, (r) => r.vendor)
  rates?: MediaVendorRate[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** Pièce du dossier prestataire (contrat, NDA, pièce d'identité, attestation fiscale…) */
@Entity('bo_media_vendor_documents')
@Index('idx_bo_media_vendor_doc_vendor', ['vendorId'])
@Index('idx_bo_media_vendor_doc_expiry', ['companyId', 'expiresAt'])
export class MediaVendorDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vendorId: string;

  @ManyToOne(() => MediaVendor, (v) => v.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendorId' })
  vendor: MediaVendor;

  @Column({ type: 'enum', enum: MediaVendorDocumentType, default: MediaVendorDocumentType.OTHER })
  type: MediaVendorDocumentType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 1000 })
  url: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes?: number | null;

  @Column({ type: 'date', nullable: true })
  expiresAt?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
