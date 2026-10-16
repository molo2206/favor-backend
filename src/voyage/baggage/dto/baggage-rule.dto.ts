import { VehicleType } from 'src/users/enum/user-vehiculetype.enum';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('vehicle_baggage_rules')
export class BaggageRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: VehicleType })
  vehicleType: VehicleType;

  @Column({ type: 'float', nullable: true })
  maxWeightKg: number;

  @Column({ type: 'float', nullable: true })
  extraPricePerKg: number;

  @Column({ default: 2 })
  maxBaggagePerPassenger: number;
}
