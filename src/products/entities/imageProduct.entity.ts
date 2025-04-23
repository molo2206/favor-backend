import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { Expose, Exclude } from 'class-transformer';

@Exclude()
@Entity()
export class ImageProductEntity {
    @Expose()
    @PrimaryGeneratedColumn()
    id: number;

    @Expose()
    @Column()
    url: string;

    @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;
}

