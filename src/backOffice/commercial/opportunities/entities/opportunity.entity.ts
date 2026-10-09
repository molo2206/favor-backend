import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CustomerEntity } from '../../customers/entities/customer.entity';
import { ProspectEntity } from '../../prospects/entities/prospect.entity';
import { OpportunityStage } from '../../common/enums/opportunity-stage.enum';

@Entity('opportunities')
export class OpportunityEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    amount: number;

    @Column({ default: 'USD' })
    currency: string;

    @Column({ type: 'int', default: 0 })
    probability: number;

    @Column({ type: 'enum', enum: OpportunityStage, default: OpportunityStage.PROSPECTING })
    stage: OpportunityStage;

    @Column({ type: 'timestamp', nullable: true })
    expectedCloseDate?: Date;

    @ManyToOne(() => CustomerEntity, { nullable: true })
    @JoinColumn({ name: 'customerId' })
    customer?: CustomerEntity;

    @Index('idx_opportunities_customer')
    @Column({ nullable: true })
    customerId?: string;

    @ManyToOne(() => ProspectEntity, { nullable: true })
    @JoinColumn({ name: 'prospectId' })
    prospect?: ProspectEntity;

    @Index('idx_opportunities_prospect')
    @Column({ nullable: true })
    prospectId?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'assignedToId' })
    assignedTo?: UserEntity;

    @Index('idx_opportunities_assigned_to')
    @Column({ nullable: true })
    assignedToId?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}