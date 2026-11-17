import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ✅ Journal d'audit : QUI (utilisateur, rôle, entreprise) a fait QUOI (action, ressource, avant / après),
 * QUAND, DEPUIS OÙ (IP, appareil, plateforme, route) et avec QUEL RÉSULTAT (statut, code HTTP, erreur, durée).
 * Chaque ligne est signée (HMAC) : une modification après coup est détectable (GET /audit-logs/:id/verify).
 * Aucune route ne modifie ni ne supprime une ligne (seule la purge de conservation, si activée).
 */
@Entity('audit_logs')
@Index('idx_audit_created', ['createdAt'])
@Index('idx_audit_user_created', ['userId', 'createdAt'])
@Index('idx_audit_entity', ['entity', 'entityId'])
@Index('idx_audit_action', ['action'])
@Index('idx_audit_category_created', ['category', 'createdAt'])
@Index('idx_audit_company_created', ['companyId', 'createdAt'])
@Index('idx_audit_status', ['status'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ---------- QUI ----------
  /** Auteur réel : l'utilisateur connecté (ou le compte qui vient de se connecter) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  userName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  userRole?: string | null;

  /** Entreprise active de l'auteur */
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  // ---------- QUOI ----------
  @Column({ type: 'varchar', length: 50 })
  action: string;

  /** Ressource (ex. orders, shipments, users…) */
  @Column({ type: 'varchar', length: 100 })
  entity: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  entityId: string | null;

  /** SECURITY, ADMIN, FINANCE, BUSINESS, TECHNICAL */
  @Column({ type: 'varchar', length: 20, default: 'BUSINESS' })
  category?: string;

  /** INFO, WARNING, CRITICAL */
  @Column({ type: 'varchar', length: 10, default: 'INFO' })
  severity?: string;

  /** Valeur avant (si connue) */
  @Column({ type: 'json', nullable: true })
  oldValue?: any;

  /** Valeur après / résultat (données sensibles masquées) */
  @Column({ type: 'json', nullable: true })
  newValue?: any;

  /** Modifications réelles en base pendant l'opération : [{ table, id, op, changes: { champ: [avant, après] } }] */
  @Column({ type: 'json', nullable: true })
  changes?: any;

  /** Paramètres, filtres, corps de la requête (masqué), identifiant tenté (connexion)… */
  @Column({ type: 'json', nullable: true })
  metadata?: any;

  // ---------- RÉSULTAT ----------
  /** SUCCESS, FAILURE, DENIED */
  @Column({ type: 'varchar', length: 10, default: 'SUCCESS' })
  status?: string;

  @Column({ type: 'int', nullable: true })
  httpStatus?: number | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  // ---------- DEPUIS OÙ ----------
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  /** ios, android, web, admin, group (en-tête x-platform) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  platform?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method?: string | null;

  /** Route (modèle) : /api/v1/orders/:id */
  @Column({ type: 'varchar', length: 255, nullable: true })
  route?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  url?: string | null;

  /** Identifiant de la requête (même valeur que dans les réponses d'erreur) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId?: string | null;

  /** Signature HMAC-SHA256 du contenu (AUDIT_HMAC_SECRET) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  signature?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  constructor(partial?: Partial<AuditLog>) {
    if (partial) Object.assign(this, partial);
  }
}
