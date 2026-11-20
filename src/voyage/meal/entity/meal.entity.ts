// src/voyage/meals/entity/meal.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Trip } from 'src/voyage/trips/entities/trip.entity';

@Entity('meals')
export class Meal {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string;

    @Column({ name: 'is_available', default: true })
    isAvailable: boolean;

    @Column({ name: 'company_id' })
    companyId: string;

    // 👇 Correction ici : nom de colonne explicite
    @Column({ name: 'trip_id', type: 'varchar', length: 36, nullable: true })
    tripId: string;

    @ManyToOne(() => CompanyEntity, (company) => company.meals, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    // Relation optionnelle sans bidirectionnalité
    @ManyToOne(() => Trip, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'trip_id' })
    trip: Trip;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}