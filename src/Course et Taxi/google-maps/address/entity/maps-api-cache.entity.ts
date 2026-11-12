import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ✅ Cache en base des réponses Google Maps (une ligne par requête unique).
 *
 *  - key_hash : SHA-256 de la requête (URL sans la clé API ni le sessiontoken) → UNIQUE = pas de doublon.
 *  - response : réponse Google telle quelle, renvoyée à l'identique lors des recherches suivantes.
 *  - expires_at : date après laquelle on redemande à Google (mise à jour de la ligne, pas de nouvelle ligne).
 *    Si Google est en erreur, la réponse expirée est quand même renvoyée (secours).
 */
@Entity('maps_api_cache')
@Index('idx_maps_api_cache_kind_expires', ['kind', 'expires_at'])
export class MapsApiCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** autocomplete, searchPlaces, nearbyPlaces, place, geocode, ipgeo, distance, directions */
  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Index('uq_maps_api_cache_key_hash', { unique: true })
  @Column({ type: 'char', length: 64 })
  key_hash: string;

  /** Requête lisible (sans clé API), pour le suivi */
  @Column({ type: 'text' })
  request: string;

  @Column({ type: 'varchar', length: 30, default: 'OK' })
  status: string;

  @Column({ type: 'json' })
  response: any;

  /** Nombre de fois où la réponse a été servie depuis la base (appels Google évités) */
  @Column({ type: 'int', default: 0 })
  hit_count: number;

  /** Nombre d'appels Google faits pour cette requête (1 + rafraîchissements) */
  @Column({ type: 'int', default: 1 })
  google_calls: number;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  last_hit_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
