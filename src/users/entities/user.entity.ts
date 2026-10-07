import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Timestamp,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../enum/user-role-enum';
import { VehicleType } from '../enum/user-vehiculetype.enum';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { Exclude } from 'class-transformer';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { TravelReservationEntity } from 'src/travel_reservation/entities/travel_reservation.entity';
import { AddressUser } from 'src/address-user/entities/address-user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { Booking } from 'src/booking/entities/booking.entity';
import { UserPlatformRoleEntity } from './user_plateform_roles.entity';
import { Wishlist } from 'src/products/entities/wishlists.entity';
import { UserHasResourceEntity } from './user-has-resource.entity';
import { Reservation } from 'src/HotelRoomAvailability/entity/Reservation.entity';
import { ColisEntity } from 'src/logistique/entity/colis.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { Ride } from 'src/Course et Taxi/Ride/entity/Ride.entity';
import { DriverVehicle } from 'src/Course et Taxi/DriverVehicle/entity/DriverVehicle.entity';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { UserNotification } from 'src/firebase/entities/user-notification.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserSettingsEntity } from './user-settings.entity';
import { UserLoyaltyEntity } from './user-loyalty.entity';
import { ReferralEntity } from './referral.entity';
import { OrderDeliveryAssignment } from 'src/order/entities/order-delivery-assignment.entity';
// import { DriverVehicle } from 'src/Course/Traitment/Entity/DriverVehicle.entity';
// import { Ride } from 'src/Course/Traitment/Entity/Ride.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Index('IDX_97672ac88f789774dd47f7c8be', { unique: true })
  @Column({ unique: true, nullable: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Index('idx_users_phone')
  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  provider: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Timestamp;

  @UpdateDateColumn()
  updatedAt: Timestamp;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  preferredLanguage?: string;

  @Column({ nullable: true, type: 'int' })
  loyaltyPoints?: number;

  @Column({ nullable: true })
  dateOfBirth?: Date;

  @Column({ nullable: true, type: 'enum', enum: VehicleType })
  vehicleType?: VehicleType;

  @Column({ nullable: true })
  plateNumber?: string;

  @Column({ nullable: true })
  licenseDocumentUrl?: string;

  @OneToMany(() => OtpEntity, (otp) => otp.user)
  otps: OtpEntity[];

  @Column({ type: 'boolean', default: false })
  isTwoFAEnabled: boolean;

  @Column({ nullable: true })
  twoFASecret: string;

  @OneToMany(
    () => UserHasCompanyEntity,
    (userHasCompany) => userHasCompany.user,
  )
  userHasCompany: UserHasCompanyEntity[];

  @Column({ nullable: true })
  socketId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true })
  @JoinColumn({ name: 'activeCompanyId' })
  activeCompany?: CompanyEntity;

  @Index('FK_993cd4e93dc84f17341702d059e')
  @Column({ nullable: true })
  activeCompanyId?: string;

  @OneToMany(() => TravelReservationEntity, (reservation) => reservation.client)
  travelReservations: TravelReservationEntity[];

  @OneToMany(() => AddressUser, (address) => address.user)
  addresses: AddressUser[];

  @ManyToOne(() => AddressUser, { nullable: true })
  defaultAddress: AddressUser;

  @Index('FK_ca511885113fd45b6de7ce6dd43')
  @Column({ nullable: true })
  defaultAddressId: string;

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

  @OneToMany(() => Booking, (booking) => booking.user)
  bookings: Booking[];

  @OneToMany(() => UserPlatformRoleEntity, (upr) => upr.user)
  userPlatformRoles: UserPlatformRoleEntity[];

  @OneToMany(() => Wishlist, (wishlist) => wishlist.user)
  wishlist: Wishlist[];

  @OneToMany(() => UserHasResourceEntity, (uhr) => uhr.user)
  userHasResources: UserHasResourceEntity[];

  @OneToMany(() => Reservation, (reservation) => reservation.user)
  reservations: Reservation[];

  @OneToMany(() => ColisEntity, (colis) => colis.sender)
  sentColis: ColisEntity[];

  @OneToMany(() => ColisEntity, (colis) => colis.receiver)
  receivedColis: ColisEntity[];

  @Index('IDX_e1e25102182182051ab13e51c8', { unique: true })
  @Column({ unique: true, nullable: true })
  appleUserId?: string;

  @OneToMany(() => Shipment, (shipment) => shipment.user, {
    cascade: true,
  })
  shipments: Shipment[];

  // Courses comme passager
  @OneToMany(() => Ride, (ride) => ride.rider)
  rides: Ride[];

  // Courses comme chauffeur
  @OneToMany(() => Ride, (ride) => ride.driver)
  drives: Ride[];

  // Véhicules du chauffeur
  @OneToMany(() => DriverVehicle, (vehicle) => vehicle.driver)
  vehicles: DriverVehicle[];

  // Ajouter ces relations
  @OneToMany(() => DeviceToken, (deviceToken) => deviceToken.user)
  deviceTokens: DeviceToken[];

  @OneToMany(() => UserNotification, (notification) => notification.user)
  notifications: UserNotification[];

  // Optionnel: garder le champ simple pour compatibilité
  @Column({ nullable: true })
  fcmToken?: string;

  @Index('fk_users_active_branch')
  @Column({ nullable: true })
  activeBranchId: string;;

  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'activeBranchId' })
  activeBranch: BranchEntity;

  @OneToOne(() => UserSettingsEntity, (settings) => settings.user, {
    cascade: true,
  })
  settings: UserSettingsEntity;


  @Column({ type: 'char', length: 36, nullable: true, unique: true })
  userIdFpay?: string;

  @Column({ type: 'boolean', default: false })
  isLink: boolean;

  @OneToMany(() => UserLoyaltyEntity, (loyalty) => loyalty.user)
  loyalty: UserLoyaltyEntity[];

  // ============================================================
  // 🔥 FONCTIONNALITÉ DE PARRAINAGE
  // ============================================================

  // Code de parrainage unique de l'utilisateur
  @Index('idx_users_referral_code')
  @Index('referralCode', { unique: true })
  @Column({ unique: true, nullable: true, length: 20 })
  referralCode?: string;

  // ID de l'utilisateur qui a parrainé cet utilisateur
  @Index('fk_users_referred_by')
  @Column({ nullable: true })
  referredBy?: string;

  // Relation avec le parrain
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'referredBy' })
  referrer?: UserEntity;

  // Liste des utilisateurs parrainés
  @OneToMany(() => UserEntity, (user) => user.referrer)
  referrals: UserEntity[];

  // Historique des parrainages
  @OneToMany(() => ReferralEntity, (referral) => referral.referrer)
  referralHistory: ReferralEntity[];

  // Nombre de personnes parrainées
  @Column({ default: 0 })
  referralCount: number;

  // Points de parrainage gagnés
  @Column({ default: 0 })
  referralPoints: number;

  // Date du dernier parrainage
  @Column({ nullable: true })
  lastReferralDate?: Date;

  // Statut du parrainage (actif/inactif)
  @Column({ default: true })
  referralActive: boolean;

  // ============================================================
  // 📦 AFFECTATIONS LIVRAISON  ← ✅ AJOUTÉ
  // ============================================================

  /** 📦 Affectations en tant que livreur (role DELIVERY) */
  @OneToMany(
    () => OrderDeliveryAssignment,
    (assignment) => assignment.deliver,
  )
  deliveryAssignments: OrderDeliveryAssignment[];

  /** 📦 Affectations créées par cet utilisateur (admin) */
  @OneToMany(
    () => OrderDeliveryAssignment,
    (assignment) => assignment.assignedBy,
  )
  assignmentsMade: OrderDeliveryAssignment[];
}
