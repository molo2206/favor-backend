import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';;
import { Exclude } from 'class-transformer';
import { Product } from './product.entity';

@Entity()
export class ImageProductEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    url: string; // Stocke le chemin ou l'URL de l'image

    @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
    @Exclude() // Empêche la boucle infinie
    product: Product;
}
