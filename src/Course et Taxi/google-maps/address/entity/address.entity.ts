import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  @Index()
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  @Index()
  longitude: number;

  @Column({ type: 'text' })
  formatted_address: string;

  @Column({ nullable: true, length: 255 })
  place_id: string;

  @Column({ nullable: true, length: 255 })
  street_number: string;

  @Column({ nullable: true, length: 255 })
  route: string;

  @Column({ nullable: true, length: 255 })
  locality: string;

  @Column({ nullable: true, length: 255 })
  administrative_area_level_1: string;

  @Column({ nullable: true, length: 255 })
  administrative_area_level_2: string;

  @Column({ nullable: true, length: 255 })
  country: string;

  @Column({ nullable: true, length: 20 })
  postal_code: string;

  @Column({ nullable: true, type: 'json' })
  geometry: any;

  @Column({ nullable: true, length: 255 })
  name: string;

  @Column({ type: 'simple-array', nullable: true })
  types: string[];

  @Column({ default: 0 })
  request_count: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_request_at: Date;

  // Champs d'icônes et médias
  @Column({ nullable: true, length: 255 })
  icon: string;

  @Column({ nullable: true, length: 50 })
  icon_background_color: string;

  @Column({ nullable: true, length: 255 })
  icon_mask_base_uri: string;

  @Column({ type: 'json', nullable: true })
  photos: any[];

  @Column({ nullable: true, length: 255 })
  reference: string;

  // Composants d'adresse complets
  @Column({ type: 'json', nullable: true })
  address_components: any;

  @Column({ nullable: true, type: 'text' })
  adr_address: string;

  // Informations business
  @Column({ nullable: true, length: 50 })
  business_status: string;

  @Column({ nullable: true, length: 50 })
  formatted_phone_number: string;

  @Column({ nullable: true, length: 50 })
  international_phone_number: string;

  @Column({ nullable: true, length: 255 })
  website: string;

  @Column({ nullable: true, type: 'boolean' })
  wheelchair_accessible_entrance: boolean;

  // Horaires d'ouverture
  @Column({ type: 'json', nullable: true })
  current_opening_hours: any;

  @Column({ type: 'json', nullable: true })
  opening_hours: any;

  // Évaluations et prix
  @Column({ type: 'float', nullable: true })
  rating: number;

  @Column({ nullable: true, type: 'int' })
  user_ratings_total: number;

  @Column({ nullable: true, type: 'int' })
  price_level: number;

  // Informations de localisation supplémentaires
  @Column({ nullable: true, type: 'json' })
  plus_code: any;

  @Column({ nullable: true, length: 255 })
  vicinity: string;

  @Column({ nullable: true, type: 'int' })
  utc_offset: number;

  // Champs de recherche et métadonnées
  @Column({ nullable: true, type: 'json' })
  reviews: any[];

  @Column({ nullable: true, type: 'simple-array' })
  formatted_phone_numbers: string[];

  @Column({ nullable: true, type: 'json' })
  editorial_summary: any;

  @Column({ nullable: true, type: 'boolean' })
  permanently_closed: boolean;

  // Champs pour la recherche textuelle
  @Column({ nullable: true, type: 'float' })
  google_rating: number;

  @Column({ nullable: true, type: 'int' })
  google_user_ratings_total: number;

  // Champs pour les chaînes d'établissements
  @Column({ nullable: true, length: 255 })
  chain_name: string;

  @Column({ nullable: true, type: 'json' })
  chain_place_id: string;

  // Champs pour les zones
  @Column({ nullable: true, length: 255 })
  sublocality: string;

  @Column({ nullable: true, length: 255 })
  sublocality_level_1: string;

  @Column({ nullable: true, length: 255 })
  sublocality_level_2: string;

  @Column({ nullable: true, length: 255 })
  neighborhood: string;

  @Column({ nullable: true, length: 255 })
  premise: string;

  @Column({ nullable: true, length: 255 })
  subpremise: string;

  // Champs pour les codes
  @Column({ nullable: true, length: 20 })
  postal_code_suffix: string;

  @Column({ nullable: true, length: 10 })
  plus_code_global: string;

  @Column({ nullable: true, length: 20 })
  plus_code_compound: string;

  // Champs pour les indices de recherche
  @Column({ type: 'text', nullable: true })
  search_vector: string;

  @Column({ nullable: true, type: 'json' })
  address_metadata: any;

  // Index pour améliorer les performances
  @Index()
  @Column({ nullable: true, length: 255 })
  normalized_name: string;

  @Index()
  @Column({ nullable: true, length: 255 })
  normalized_city: string;
}
