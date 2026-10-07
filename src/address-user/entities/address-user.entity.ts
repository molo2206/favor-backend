import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { Address } from 'src/address-user/enum/address.status.enum';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

@Entity('address_user')
export class AddressUser {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    address: string;

    @Column()
    phone: string;

    @Column({
        type: 'enum',
        enum: Address,
        default: Address.HOME,
    })
    type: Address;

    @ManyToOne(() => UserEntity, (user) => user.addresses, { onDelete: 'CASCADE' })
    user: UserEntity;

    @Column({ default: false })
    isDefault: boolean;

    @Column({ type: 'double precision' })
    latitude: number;
    
    @Column({ type: 'double precision' })
    longitude: number;

    // ============================================================
    // ✅ AJOUT DES CHAMPS countryId ET cityId
    // ============================================================

    @Column({ nullable: true })
    countryId: string | null; // ✅ Ajouter | null

    @ManyToOne(() => Country, { nullable: true })
    @JoinColumn({ name: 'countryId' })
    country: Country | null; // ✅ Ajouter | null

    @Column({ nullable: true })
    cityId: string | null; // ✅ Ajouter | null

    @ManyToOne(() => City, { nullable: true })
    @JoinColumn({ name: 'cityId' })
    city: City | null; // ✅ Ajouter | null

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}