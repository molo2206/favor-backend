import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn
  } from 'typeorm';
  import { DeliveryEntity } from 'src/delivery/entities/delivery.entity';
  
  @Entity('signature')
  export class SignatureEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @ManyToOne(() => DeliveryEntity, { nullable: false })
    @JoinColumn({ name: 'delivery_id' })
    delivery: DeliveryEntity;
  
    @Column({ type: 'text' }) // ou 'varchar' si c'est un base64 de l'image
    signatureData: string;
  
    @CreateDateColumn()
    signedAt: Date;
  }
  