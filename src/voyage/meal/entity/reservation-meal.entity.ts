// src/voyage/reservations-vehicles/entities/reservation-meal.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TripSegment } from '../../trips/entities/trip-segment.entity';
import { ReservationVehicule } from 'src/voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import { Meal } from './meal.entity';

@Entity('reservation_meals')
export class ReservationMeal {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 36 })
    reservation_id: string;

    @Column({ type: 'varchar', length: 36 })
    meal_id: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    segment_id: string; // optionnel : lier le repas à un segment spécifique

    @Column({ type: 'int', default: 1 })
    quantity: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    unit_price: number;

    @ManyToOne(() => ReservationVehicule, (reservation) => reservation.meals)
    @JoinColumn({ name: 'reservation_id' })
    reservation: ReservationVehicule;

    @ManyToOne(() => Meal)
    @JoinColumn({ name: 'meal_id' })
    meal: Meal;

    @ManyToOne(() => TripSegment, { nullable: true })
    @JoinColumn({ name: 'segment_id' })
    segment: TripSegment;
}