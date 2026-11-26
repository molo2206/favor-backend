import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CensusChannel, CensusResult } from '../../common/enums/census.enum';
import { CensusRecordEntity } from './census-record.entity';

/** ✅ Historique des relances d'une fiche de recensement */
@Entity('census_followups')
export class CensusFollowupEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => CensusRecordEntity, (r) => r.followups, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'recordId' })
    record: CensusRecordEntity;

    @Index('idx_census_followups_record')
    @Column({ length: 36 })
    recordId: string;

    @Column({ type: 'enum', enum: CensusChannel, default: CensusChannel.CALL })
    channel: CensusChannel;

    @Column({ type: 'enum', enum: CensusResult })
    result: CensusResult;

    @Column({ type: 'text', nullable: true })
    note?: string;

    @Column({ type: 'datetime', nullable: true })
    nextFollowUpAt?: Date;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdById' })
    createdBy?: UserEntity;

    @Column({ length: 36, nullable: true })
    createdById?: string;

    @CreateDateColumn()
    createdAt: Date;
}
