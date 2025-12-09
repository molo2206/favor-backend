import { Product } from 'src/products/entities/product.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Room } from 'src/room/entities/room.entity';

@Entity('measures')
export class MeasureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Ex : Kilogramme

  @Column()
  abbreviation: string; // Ex : kg

  @ManyToOne(() => CompanyEntity, (company) => company.measures, {
    nullable: true, // ✅ Rend la clé étrangère nullable
    onDelete: 'SET NULL', // ✅ Si l’entreprise est supprimée, la valeur devient NULL
  })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @OneToMany(() => Product, (product) => product.measure)
  products: Product[];

  @OneToMany(() => Room, (room) => room.measure)
  rooms: Room[];
}
