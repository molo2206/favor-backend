// src/shipments/entities/shipment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TypeTransport } from './type-transport.entity';
import { PackageDetails } from './package-details.entity';
import { ShipmentTracking } from './shipment_tracking.entity';
import { ShipmentStatus } from '../enum/shipment.dto';
import { ShipmentPickupPaymentStatus, ShipmentPickupPaymentTiming } from '../enum/shipment-pickup.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { LtaShipmentEntity } from '../Lta/entity/lta-shipment.entity';
import { AddressUser } from 'src/address-user/entities/address-user.entity';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';

@Index('idx_perf_shipments_created', ['createdAt'])
@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  trackingNumber: string;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  userId?: string;

  @Column({ nullable: true })
  image?: string;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ default: false })
  pickupEnabled: boolean;

  @Column({ default: false })
  shippingEnabled: boolean;

  @Column({ default: false })
  deliveryEnabled: boolean;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({ nullable: true })
  pickupFrom: string;

  @Column({ nullable: true })
  pickupTo: string;

  @Column({ nullable: true })
  pickupContactName: string;

  @Column({ nullable: true })
  pickupContactPhone: string;

  @Column({ nullable: true })
  shippingFrom: string;

  @Column({ nullable: true })
  shippingTo: string;

  @Column({ nullable: true })
  deliveryFrom: string;

  @Column({ nullable: true })
  deliveryTo: string;

  @Column({ nullable: true })
  deliveryContactName: string;

  @Column({ nullable: true })
  deliveryContactPhone: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt?: Date;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'pickupTransportTypeId', // Nom explicite
  })
  pickupTransportTypeId: string;

  @ManyToOne(() => TypeTransport, { nullable: true })
  @JoinColumn({ name: 'pickupTransportTypeId' })
  pickupTransportType: TypeTransport;

  @OneToOne(() => PackageDetails, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  package: PackageDetails;

  @OneToMany(() => ShipmentTracking, (tracking) => tracking.shipment, {
    cascade: true,
  })
  trackings: ShipmentTracking[];

  @Column({ type: 'float', nullable: true })
  pickupPrice: number;

  // ==========================================================================
  // ✅ RAMASSAGE tarifé (même logique que les colis) : zone, prix selon le poids,
  //    moment et état du paiement. (pickupPrice ci-dessus porte le prix calculé.)
  // ==========================================================================
  @Column({ type: 'char', length: 36, nullable: true })
  pickupCountryId?: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  pickupCityId?: string | null;

  /** Devise du prix de ramassage */
  @Column({ type: 'varchar', length: 10, nullable: true })
  pickupCurrency?: string | null;

  /** Déjà payé au fournisseur, ou à payer pendant le ramassage */
  @Column({ type: 'enum', enum: ShipmentPickupPaymentTiming, nullable: true })
  pickupPaymentTiming?: ShipmentPickupPaymentTiming | null;

  /** Si PAS encore payé au fournisseur : montant dû au fournisseur (à régler au ramassage) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  supplierAmountDue?: number | null;

  // ---- Vérification du poids au ramassage (le poids constaté par le livreur fait foi) ----
  /** Poids déclaré par le client à la création (audit) */
  @Column({ type: 'float', nullable: true })
  declaredWeight?: number | null;

  /** Poids constaté par le livreur à l'enlèvement */
  @Column({ type: 'float', nullable: true })
  verifiedWeight?: number | null;

  /** Livreur (ou admin) ayant constaté le poids */
  @Column({ type: 'char', length: 36, nullable: true })
  verifiedBy?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  verifiedAt?: Date | null;

  /** Écart de prix de ramassage après recalcul (nouveau - ancien) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  pickupPriceAdjustment?: number | null;

  /** Déjà payé mais poids plus lourd → complément à encaisser */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  pickupSurchargeDue?: number | null;

  /** Déjà payé mais poids plus léger → trop-perçu à rembourser (validé par l'admin) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  pickupRefundDue?: number | null;

  /** Mode d'encaissement (mêmes modes que les commandes : CASH, MOBILE_MONEY, BANK, MANUAL, FPAY) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  pickupPaymentMethod?: string | null;

  /** État du paiement du ramassage */
  @Column({ type: 'enum', enum: ShipmentPickupPaymentStatus, default: ShipmentPickupPaymentStatus.PENDING })
  pickupPaymentStatus: ShipmentPickupPaymentStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  pickupPaidAt?: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pickupPaymentReference?: string | null;

  // ---- Affectation du ramassage à un livreur (côté livreur ou côté admin) ----
  /** Livreur affecté au ramassage (le premier qui le prend le garde) */
  @Column({ type: 'char', length: 36, nullable: true })
  pickupDelivererId?: string | null;

  /** Qui a affecté le ramassage : le livreur lui-même (prise) ou un admin (affectation) */
  @Column({ type: 'char', length: 36, nullable: true })
  pickupAssignedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  pickupAssignedAt?: Date | null;

  @Column({ nullable: true })
  whatsapp_number?: string;

  @Column({ nullable: true })
  paymentMethod?: string;

  @Column({ type: 'float', nullable: true })
  shippingPrice: number;

  @Column({ type: 'float', nullable: true })
  deliveryPrice: number;

  @Column({ type: 'float', nullable: true })
  totalPrice: number;

  /** ✅ Tarification pro : total CLIENT = clientPrice(expéditrice) + clientPrice(destinataire) */
  @Column({ name: 'clientTotal', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  clientTotal: number;

  /** ✅ Tarification pro : total FOURNISSEUR = supplierPrice(expéditrice) + supplierPrice(destinataire) */
  @Column({ name: 'supplierTotal', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  supplierTotal: number;

  /** ✅ Instantané des tarifs appliqués au moment du calcul (historique figé même si les tarifs changent après) */
  @Column({ name: 'pricingBreakdown', type: 'json', nullable: true })
  pricingBreakdown?: any;

  /** ✅ Devise des prix du colis (pickupPrice, shippingPrice, deliveryPrice, totalPrice) : USD, CDF… */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  clientName?: string;

  @Column({ nullable: true })
  clientPhone?: string;

  @Column({ nullable: true })
  fournisseurName?: string;

  @Column({ nullable: true })
  fournisseurPhone?: string;

  @Column({ type: 'boolean', default: false })
  isPaid: boolean;

  @OneToMany(() => LtaShipmentEntity, (ltaShipment) => ltaShipment.shipment)
  ltaShipments: LtaShipmentEntity[];

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  deliveryAddressId?: string;

  @ManyToOne(() => AddressUser, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'deliveryAddressId' })
  deliveryAddress?: AddressUser;

  @Column({ nullable: true, length: 6 })
  pin: string;

  @Column({ default: false })
  paid: boolean;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  userAssignId?: string;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userAssignId' })
  userAssign?: UserEntity;

  @OneToMany(() => OperationEntity, (op) => op.shipment)
  operations!: OperationEntity[];

  // 🔹 PICKUP
  @Column({ type: 'varchar', length: 36, nullable: true })
  pickupCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickupCompanyId' })
  pickupCompany?: CompanyEntity;

  // 🔹 SHIPPING
  @Column({ type: 'varchar', length: 36, nullable: true })
  shippingCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shippingCompanyId' })
  shippingCompany?: CompanyEntity;

  // 🔹 DELIVERY
  @Column({ type: 'varchar', length: 36, nullable: true })
  deliveryCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deliveryCompanyId' })
  deliveryCompany?: CompanyEntity;

  @Column({ type: 'varchar', length: 50, nullable: true })
  loyaltyCode?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  loyaltyCodeFournisseur?: string;

  @Column({ nullable: true })
  fournisseurId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fournisseurId' })
  fournisseur?: UserEntity;

  // ============================================================
  // ✅ SUPPLY : lien avec la commande d'origine
  //    (shipment créé à partir d'une commande — voir module src/supply)
  // ============================================================
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_shipments_order')
  orderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  subOrderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_shipments_supply')
  supplyId?: string | null;
}
