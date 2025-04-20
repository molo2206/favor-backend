import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class ImageProductEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    url: string; // Stocke le chemin ou l'URL de l'image

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'productId' })
    product: Product;
    
}
