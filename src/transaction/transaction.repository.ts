// transaction.repository.ts
import { EntityRepository, Repository } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';

@EntityRepository(TransactionEntity)
export class TransactionEntityRepository extends Repository<TransactionEntity> {}
