import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

/**
 * ✅ Portefeuille des gains d'un chauffeur, UN PAR DEVISE (USD, CDF…).
 *
 *  - Créé automatiquement dès qu'une course dans cette devise est attribuée au chauffeur
 *    (course réservée en USD → portefeuille USD, en CDF → portefeuille CDF…).
 *  - Les montants ne sont jamais convertis ni additionnés entre devises.
 *  - Les soldes enregistrés ici sont une COPIE à jour (earned / withdrawn / available) recalculée à partir
 *    des courses et des retraits à chaque consultation ou retrait : la source de vérité reste les courses
 *    (rides) et les retraits (driver_cashouts), jamais ce solde seul.
 *  - Retrait : le chauffeur choisit le portefeuille (la devise) puis reçoit l'argent dans la MÊME devise,
 *    sur son Mobile Money ou sur son compte F-Pay (wallet F-Pay de la même devise).
 */
@Entity('driver_wallets')
@Index('uq_driver_wallet_currency', ['driverId', 'currency'], { unique: true })
export class DriverWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  driverId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver?: UserEntity;

  /** Devise du portefeuille (USD, CDF…) */
  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** ACTIVE | BLOCKED (bloqué par l'administration : retraits refusés dans cette devise) */
  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  /** Gains des courses payées dans l'application (copie à jour) */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  earned: number;

  /** Déjà retiré avec succès (copie à jour) */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  withdrawn: number;

  /** Retirable maintenant (copie à jour) */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  available: number;

  /** Nombre de courses terminées dans cette devise */
  @Column({ type: 'int', default: 0 })
  ridesCount: number;

  /** ✅ Wallet F-Pay du chauffeur dans cette devise (crédité au retrait) — mémorisé après le premier retrait */
  @Column({ type: 'varchar', length: 64, nullable: true })
  fpayWalletId?: string | null;

  /** Course qui a créé le portefeuille */
  @Column({ type: 'varchar', length: 36, nullable: true })
  firstRideId?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastSyncedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
