// baggage-rule.entity.ts
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

@Entity('vehicle_baggage_rules')
export class VehicleBaggageRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ['BUS', 'TAXI', 'MINIBUS', 'CAR'],
    default: 'BUS',
  })
  @Index('idx_vehicle_type')
  vehicle_type: string;

  @Column({ type: 'float' })
  max_weight_kg: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  extra_price_per_kg: number | null;

  @Column({ type: 'int', default: 2 })
  max_baggage_per_passenger: number;

  @Column({ type: 'varchar', length: 36 })
  company_id: string;

  @ManyToOne(() => CompanyEntity, (company) => company.vehicles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;
}
