import { UserEntity } from 'src/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';


@Entity()
export class OtpEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column() 
    email: string;

    @ManyToOne(() => UserEntity, (user) => user.otps, { onDelete: 'CASCADE' })
    user: UserEntity;

    @Column()
    otpCode: string;

    @Column({ default: false })
    isUsed: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date;
}