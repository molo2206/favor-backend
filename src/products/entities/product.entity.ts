import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ImageProductEntity } from './imageProduct.entity';
import { Expose, Type } from 'class-transformer';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column()
    type: string;

    // Champs spécifiques aux différents types
    @Column({ nullable: true })
    // Pour services
    durationInMinutes?: number;

    @Column({ nullable: true })
    // Pour location de voitures
    carModel?: string;

    @Column({ nullable: true })
    // Pour location de voitures
    licensePlate?: string;

    @Column({ nullable: true })
    // Pour restauration
    ingredients?: string;

    @Column({ nullable: true })
    // Pour produits physiques
    stockQuantity?: number;

    @Column({ nullable: true })
    image?: string;

    @ManyToOne(() => CompanyEntity, (company) => company.id, { nullable: false, onDelete: 'CASCADE' })
    company: CompanyEntity;

    @ManyToOne(() => CategoryEntity, (category) => category.products, { nullable: true })
    @JoinColumn({ name: 'category_id' })
    category?: CategoryEntity;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Expose()
    @OneToMany(() => ImageProductEntity, (image) => image.product, { cascade: true })
    @Type(() => ImageProductEntity)
    images: ImageProductEntity[];
}
