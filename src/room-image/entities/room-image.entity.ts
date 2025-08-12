import { Room } from 'src/room/entities/room.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';

@Entity('room_image')
export class RoomImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  altText?: string;

  @ManyToOne(() => Room, (room) => room.images, { onDelete: 'CASCADE' })
  room: Room;
}
