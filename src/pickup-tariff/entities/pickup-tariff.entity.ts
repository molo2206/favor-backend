import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PickupTariffTierEntity } from './pickup-tariff-tier.entity';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

/**
 * ✅ Tarif de RAMASSAGE de colis — module indépendant.
 *
 * Un tarif couvre une zone (pays + ville) et porte des PALIERS dynamiques,
 * au POIDS (kg) : 1–10 kg = 2$, 11–20 kg = 3$, … La ville peut être NULL =
 * tarif par défaut du pays (repli si aucune ville précise ne correspond).
 *
 * country / city sont des RELATIONS vers les tables `countries` / `cities`.
 */
@Entity('pickup_tariffs')
@Index('idx_pickup_tariffs_zone', ['countryId', 'cityId'])
export class PickupTariffEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Libellé optionnel (ex. « Ramassage Goma centre ») */
  @Column({ type: 'varchar', length: 150, nullable: true })
  name?: string | null;

  // 🌍 Relation PAYS (obligatoire)
  @Column({ type: 'varchar', length: 36 })
  countryId: string;

  @ManyToOne(() => Country, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'countryId' })
  country?: Country;

  // 🏙️ Relation VILLE (NULL = tarif par défaut du pays)
  @Column({ type: 'varchar', length: 36, nullable: true })
  cityId?: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cityId' })
  city?: City | null;

  /** Devise des prix des paliers */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Tarif actif ? */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => PickupTariffTierEntity, (tier) => tier.tariff, {
    cascade: true,
    eager: true,
  })
  tiers: PickupTariffTierEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
