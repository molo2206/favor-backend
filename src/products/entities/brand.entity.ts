import { slugify } from 'src/users/utility/slug/slugify';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  OneToMany,
} from 'typeorm';
import { Product } from './product.entity';
@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ nullable: true })
  type?: string;

  @Column({ default: true })
  status: boolean;

  // Nouveau champ slug
  @Column({ unique: true })
  slug: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Générer automatiquement le slug avant l'insertion
  @BeforeInsert()
  generateSlug() {
    if (!this.slug && this.name) {
      // Utilisation de ta fonction slugify
      this.slug = slugify(this.name, { lower: true, strict: true });
    }
  }

  // Relation avec Product
  @OneToMany(() => Product, (product) => product.brand)
  products: Product[];
}
