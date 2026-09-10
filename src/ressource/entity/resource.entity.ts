// Correction : importer CompanyHasResource (sans Entity)
import { CompanyHasResourceEntity } from 'src/company_has_usrResource/entities/company_has_Resource.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  label: string; // Correction : String → string

  @Column()
  description?: string;

  @Column({ default: true })
  status: boolean;

  @Column({ default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CompanyHasUserResource, (chr) => chr.resource)
  companyUserResources: CompanyHasUserResource[];

  @OneToMany(() => CompanyHasResourceEntity, (chr) => chr.resource)
  companyResources: CompanyHasResourceEntity[];
}
