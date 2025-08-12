import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BedType } from '../enum/bedtype.enum';
import { RoomStatus } from '../enum/roomStatus.enum';
import { RoomImage } from 'src/room-image/entities/room-image.entity';
import { Booking } from 'src/booking/entities/booking.entity';

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

  @Column('simple-array')
  amenities: string[];

  @Column({
    type: 'enum',
    enum: BedType,
    default: BedType.SINGLE,
    nullable: false,
  })
  bedType: BedType;

  @Column({ type: 'float', nullable: true })
  sizeSqm?: number;

  @Column({ nullable: true })
  floorNumber?: number;

  @Column({ nullable: true })
  viewType?: string;

  @Column({ default: false })
  smokingAllowed: boolean;

  @Column({ default: false })
  accessible: boolean;

  @Column({ default: '14:00' })
  checkInTime: string;

  @Column({ default: '12:00' })
  checkOutTime: string;

  @Column({ type: 'enum', enum: RoomStatus, default: RoomStatus.AVAILABLE })
  status: RoomStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => RoomImage, (image) => image.room, { cascade: true })
  images: RoomImage[];

  @OneToMany(() => Booking, (booking) => booking.room)
  bookings: Booking[];
}
