import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RoleUser {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ nullable: false })
    name: string;
}
