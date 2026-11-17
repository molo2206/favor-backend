import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BedType } from '../enum/bedtype.enum';
import { RoomStatus } from '../enum/roomStatus.enum';
import { RoomImage } from 'src/room-image/entities/room-image.entity';
import { Booking } from 'src/booking/entities/booking.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { Expose, Type } from 'class-transformer';

@Entity('room')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  capacity: number;

  @Column('float')
  price: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: BedType,
    default: BedType.SINGLE,
    nullable: false,
  })
  bedType: BedType;

  @Column({ type: 'enum', enum: RoomStatus, default: RoomStatus.AVAILABLE })
  status: RoomStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => RoomImage, (image) => image.room, { cascade: true })
  @Type(() => RoomImage)
  @Expose()
  images: RoomImage[];

  @OneToMany(() => Booking, (booking) => booking.room)
  bookings: Booking[];

  @ManyToOne(() => CompanyEntity, (company) => company.rooms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Column()
  companyId: string;

  @ManyToOne(() => MeasureEntity, (measure) => measure.rooms, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'measureId' })
  measure: MeasureEntity;

  @Column({ nullable: true })
  measureId?: string;
}
