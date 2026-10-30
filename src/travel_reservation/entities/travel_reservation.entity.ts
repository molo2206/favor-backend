import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { TravelType } from 'src/travel_reservation/enum/travel.type.enum';
import { ReservationStatus } from 'src/travel_reservation/enum/reservation.status.enum';
import { IsEnum } from 'class-validator';

@Entity('travel_reservations')
export class TravelReservationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: TravelType })
    type: TravelType;

    @Column({ nullable: true })
    departureLocation?: string;

    @Column({ nullable: true })
    arrivalLocation?: string;

    @Column({ type: 'timestamp', nullable: true })
    departureDate?: Date;

    @Column({ type: 'timestamp', nullable: true })
    arrivalDate?: Date;

    @Column({ type: 'timestamp', nullable: true })
    reservationDate: Date;

    // @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    // price: number;

    @Column({ nullable: true })
    seatNumber?: string; // pour avion/bateau

    @ManyToOne(() => UserEntity, (user) => user.travelReservations, { nullable: false })
    client: UserEntity;

    @IsEnum(ReservationStatus, {
        message: `Le statut doit être : ${Object.values(ReservationStatus).join(', ')}`,
    })
    @Column({
        type: 'enum',
        enum: ReservationStatus,
        default: ReservationStatus.PENDING,
    })
    status: ReservationStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
