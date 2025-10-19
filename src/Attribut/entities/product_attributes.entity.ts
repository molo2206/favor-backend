import { Product } from 'src/products/entities/product.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { GlobalAttribute } from './global_attributes.entity';
import { AttributeValue } from './attribute_values.entity';


@Entity('product_attributes')
export class ProductAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.attributes, {
    onDelete: 'CASCADE',
  })
  product: Product;

  @Column({ nullable: true })
  globalAttrId?: string;

  @ManyToOne(() => GlobalAttribute, { nullable: true })
  globalAttr?: GlobalAttribute;

  @Column()
  name: string;

  @OneToMany(() => AttributeValue, (val) => val.attribute, { cascade: true })
  values: AttributeValue[];
}
