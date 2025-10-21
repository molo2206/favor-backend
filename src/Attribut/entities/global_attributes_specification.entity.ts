import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { GlobalAttribute } from './global_attributes.entity';
import { Specification } from 'src/specification/entities/Specification.entity';

/**
 * Cette entité lie un attribut global à une spécification.
 * Exemple : "Couleur" (GlobalAttribute) -> "Nom de couleur" (Specification)
 */
@Entity('global_attributes_specifications')
export class GlobalAttributesSpecification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GlobalAttribute, (ga) => ga.specifications, {
    onDelete: 'CASCADE',
  })
  globalAttribute: GlobalAttribute;

  @ManyToOne(() => Specification, (spec) => spec.globalAttributes, {
    onDelete: 'CASCADE',
  })
  specification: Specification;

  @Column({ default: true })
  isRequired: boolean;

  @Column({ default: true })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
