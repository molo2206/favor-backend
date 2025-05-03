import { Product } from 'src/products/entities/product.entity';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    ManyToOne,
    JoinColumn,
} from 'typeorm';

@Entity('category')
export class CategoryEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    image?: string;

    @Column({ unique: true })
    slug: string;

    @Column({ nullable: true })
    type?: string;

    @Column({ nullable: true })
    color?: string;

    @ManyToOne(() => CategoryEntity, (category) => category.children)
    @JoinColumn({ name: 'parent_id' })
    parent: CategoryEntity;

    @OneToMany(() => CategoryEntity, (category) => category.parent)
    children: CategoryEntity[];

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];
}
