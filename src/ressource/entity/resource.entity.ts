import { UserHasResourceEntity } from 'src/users/entities/user-has-resource.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  label: string;

  @Column({ unique: true })
  value: string;

  @Column({ default: true })
  status: boolean;

  @Column({ default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserHasResourceEntity, (uhr) => uhr.resource)
  userHasResources: UserHasResourceEntity[];
}
