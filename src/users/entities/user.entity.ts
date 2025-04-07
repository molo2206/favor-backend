import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Timestamp, UpdateDateColumn } from "typeorm";
import { UserRole } from "../utility/common/user-role-enum";
import { VehicleType } from "../utility/common/user-vehiculetype.enum";
import { OtpEntity } from "src/otp/entities/otp.entity";
import { Exclude } from "class-transformer";
import { UserHasCompanyEntity } from "src/user_has_company/entities/user_has_company.entity";

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

    @Column()
    phone: string;

    @Column()
    image: string;

    @Column({ type: 'enum', enum: UserRole })
    role: UserRole;

    @Column()
    country: string;

    @Column()
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
    userHasCompanies: UserHasCompanyEntity[];
}
