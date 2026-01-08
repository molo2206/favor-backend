import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity'; // adapte le chemin selon ta structure
import { Address } from 'src/address-user/enum/address.status.enum';


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
    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
