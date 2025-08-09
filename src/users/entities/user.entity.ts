import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
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
import { RentalContract } from 'src/rental-contract/entities/rental-contract.entity';
import { SaleTransaction } from 'src/sale-transaction/entities/sale-transaction.entity';
import { ReservService } from 'src/reserv-service/entities/reserv-service.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Timestamp;

  @UpdateDateColumn()
  updatedAt: Timestamp;

  //Champs spécifiques aux clients
  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  preferredLanguage?: string;

  @Column({ nullable: true, type: 'int' })
  loyaltyPoints?: number;

  @Column({ nullable: true })
  dateOfBirth?: Date;

  // Champs spécifiques aux livreurs
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

  @OneToMany(() => UserHasCompanyEntity, (userHasCompany) => userHasCompany.user)
  userHasCompany: UserHasCompanyEntity[];

  @Column({ nullable: true })
  socketId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true })
  @JoinColumn({ name: 'activeCompanyId' })
  activeCompany?: CompanyEntity;

  @Column({ nullable: true })
  activeCompanyId?: string;

  @OneToMany(() => TravelReservationEntity, (reservation) => reservation.client)
  travelReservations: TravelReservationEntity[];

  @OneToMany(() => AddressUser, (address) => address.user)
  addresses: AddressUser[];

  @ManyToOne(() => AddressUser, { nullable: true })
  defaultAddress: AddressUser;

  @Column({ nullable: true })
  defaultAddressId: string;

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

  @OneToMany(() => RentalContract, (contract) => contract.customer)
  rentalContracts: RentalContract[];

  @OneToMany(() => SaleTransaction, (sale) => sale.customer)
  saleTransactions: SaleTransaction[];

  @OneToMany(() => ReservService, (reservation) => reservation.user)
  reservations: ReservService[];
}
