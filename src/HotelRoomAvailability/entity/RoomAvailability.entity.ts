import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Product } from 'src/products/entities/product.entity';

@Entity()
export class RoomAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (roomType) => roomType.availability)
  product: Product;

  @Column({ type: 'date' })
  date: string;

  @Column()
  roomsAvailable: number;

  @Column({ type: 'int', default: 0 })
  roomsBooked: number;

  @Column({ type: 'int', default: 0 })
  roomsRemaining: number;
}
