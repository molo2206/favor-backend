import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Brackets, Repository } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { FilesService } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { VehicleRegistration } from './entities/vehicle-registration.entity';
import { VEHICLE_MAX_IMAGES } from './enums/vehicle-registration.enum';
import {
  CreateVehicleRegistrationDto,
  UpdateVehicleRegistrationDto,
  UpdateVehicleRegistrationStatusDto,
  VehicleRegistrationQueryDto,
} from './dto/vehicle-registration.dto';

const IMAGE_FOLDER = 'vehicle-registrations';

/**
 * ✅ Enregistrement des véhicules (vente / location) avec propriétaire, commissionnaire et images.
 * Accès : la personne qui a enregistré le véhicule, ou un admin / super admin
 * (les coordonnées du propriétaire et du commissionnaire ne sont jamais publiques).
 */
@Injectable()
export class VehicleRegistrationService {
  private readonly logger = new Logger(VehicleRegistrationService.name);

  constructor(
    @InjectRepository(VehicleRegistration)
    private readonly repo: Repository<VehicleRegistration>,
    private readonly files: FilesService,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  // ============================================================
  // OUTILS
  // ============================================================

  private isAdmin(user?: UserEntity | null): boolean {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }

  private assertAccess(vehicle: VehicleRegistration, user: UserEntity, lang: string): void {
    if (this.isAdmin(user) || (vehicle.createdById && vehicle.createdById === user?.id)) return;
    throw new ForbiddenException(this.t('vehicle_registration.forbidden', lang));
  }

  /** Plaque : majuscules, espaces multiples réduits */
  private normalizePlate(plate?: string | null): string | null {
    const p = String(plate ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return p || null;
  }

  /** Plaque comparée sans espaces ni tirets (« AB-123 CD » = « AB123CD ») */
  private compactPlate(plate: string): string {
    return plate.replace(/[\s-]/g, '');
  }

  /** Référence lisible : VH-AAMMJJ-XXXXX (unique) */
  private async newReference(): Promise<string> {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 10; i++) {
      const reference = `VH-${ymd}-${randomBytes(4).toString('hex').slice(0, 5).toUpperCase()}`;
      const exists = await this.repo.count({ where: { reference }, withDeleted: true });
      if (!exists) return reference;
    }
    return `VH-${ymd}-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Une autre fiche (non supprimée) a-t-elle déjà cette plaque ? */
  private async assertPlateFree(plate: string | null | undefined, lang: string, exceptId?: string): Promise<void> {
    if (!plate) return;
    const qb = this.repo
      .createQueryBuilder('v')
      .where("REPLACE(REPLACE(UPPER(v.plateNumber), ' ', ''), '-', '') = :plate", { plate: this.compactPlate(plate) });
    if (exceptId) qb.andWhere('v.id <> :id', { id: exceptId });
    const other = await qb.getOne();
    if (other) {
      throw new ConflictException(this.t('vehicle_registration.plate_exists', lang, { plate, reference: other.reference }));
    }
  }

  /**
   * Règles de cohérence (création et modification) :
   *  - prix maximum ≥ prix minimum (absent = prix minimum) ;
   *  - commissionnaire : nom ET téléphone, ou rien du tout ; différent du propriétaire.
   */
  private validate(v: VehicleRegistration, lang: string, priceMaxSent: boolean): void {
    if (v.priceMax === null || v.priceMax === undefined || (!priceMaxSent && Number(v.priceMax) < Number(v.priceMin))) {
      v.priceMax = v.priceMin;
    }
    if (Number(v.priceMax) < Number(v.priceMin)) {
      throw new BadRequestException(this.t('vehicle_registration.price_range_invalid', lang, { min: v.priceMin, max: v.priceMax }));
    }

    const hasBroker = !!v.brokerName || !!v.brokerPhone || (v.brokerAmount !== null && v.brokerAmount !== undefined);
    if (hasBroker && (!v.brokerName || !v.brokerPhone)) {
      throw new BadRequestException(this.t('vehicle_registration.broker_incomplete', lang));
    }
    if (v.brokerPhone && v.brokerPhone === v.ownerPhone) {
      throw new BadRequestException(this.t('vehicle_registration.broker_same_as_owner', lang));
    }
  }

  /** Envoi des images : tout ou rien (les images déjà stockées sont supprimées en cas d'erreur) */
  private async uploadImages(files: Express.Multer.File[] | undefined): Promise<string[]> {
    const urls: string[] = [];
    try {
      for (const file of files ?? []) {
        urls.push(await this.files.uploadImageUrl(file, IMAGE_FOLDER));
      }
      return urls;
    } catch (error) {
      await this.deleteImages(urls);
      throw error;
    }
  }

  private async deleteImages(urls: string[]): Promise<void> {
    for (const url of urls) {
      try {
        await this.files.deleteFileByUrl(url);
      } catch (e: any) {
        this.logger.warn(`Image non supprimée (${url}) : ${e?.message}`);
      }
    }
  }

  /** Champs du DTO copiés sur la fiche (seulement ceux envoyés) */
  private applyDto(v: VehicleRegistration, dto: Partial<CreateVehicleRegistrationDto> | UpdateVehicleRegistrationDto): void {
    const fields: (keyof CreateVehicleRegistrationDto)[] = [
      'name',
      'brand',
      'year',
      'color',
      'transmission',
      'mileage',
      'engineCondition',
      'originality',
      'availableDocuments',
      'locationAddress',
      'city',
      'latitude',
      'longitude',
      'registrationType',
      'priceMin',
      'priceMax',
      'currency',
      'ownerName',
      'ownerAddress',
      'ownerPhone',
      'brokerName',
      'brokerPhone',
      'brokerAmount',
      'status',
      'notes',
    ];
    for (const f of fields) {
      if (dto[f] !== undefined) (v as any)[f] = dto[f];
    }
    if (dto.plateNumber !== undefined) v.plateNumber = this.normalizePlate(dto.plateNumber);
    if (dto.availableDocuments !== undefined) {
      const docs: string[] = (dto.availableDocuments as string[]).map((d) => String(d).trim().toUpperCase()).filter(Boolean);
      v.availableDocuments = Array.from(new Set<string>(docs));
    }
  }

  private async load(id: string, lang: string): Promise<VehicleRegistration> {
    const vehicle = await this.repo
      .createQueryBuilder('v')
      .leftJoin('v.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.fullName'])
      .where('v.id = :id', { id })
      .getOne();
    if (!vehicle) throw new NotFoundException(this.t('vehicle_registration.not_found', lang));
    return vehicle;
  }

  // ============================================================
  // CRÉER
  // ============================================================

  async create(dto: CreateVehicleRegistrationDto, files: Express.Multer.File[] | undefined, user: UserEntity, lang: string) {
    if ((files?.length ?? 0) > VEHICLE_MAX_IMAGES) {
      throw new BadRequestException(this.t('vehicle_registration.too_many_images', lang, { max: VEHICLE_MAX_IMAGES }));
    }

    const vehicle = this.repo.create({ currency: 'USD' });
    this.applyDto(vehicle, dto);
    vehicle.currency = (vehicle.currency || 'USD').toUpperCase();
    this.validate(vehicle, lang, dto.priceMax !== undefined);
    await this.assertPlateFree(vehicle.plateNumber, lang);

    // Images envoyées seulement quand les données sont valides
    const urls = await this.uploadImages(files);
    try {
      vehicle.images = urls;
      vehicle.reference = await this.newReference();
      vehicle.createdById = user?.id ?? null;
      vehicle.updatedById = user?.id ?? null;
      const saved = await this.repo.save(vehicle);
      return {
        message: this.t('vehicle_registration.created', lang, { reference: saved.reference, name: saved.name }),
        data: await this.load(saved.id, lang),
      };
    } catch (error) {
      await this.deleteImages(urls); // rien n'est enregistré : pas d'image orpheline
      throw error;
    }
  }

  // ============================================================
  // CONSULTER
  // ============================================================

  async findAll(query: VehicleRegistrationQueryDto, user: UserEntity, lang: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = this.repo
      .createQueryBuilder('v')
      .leftJoin('v.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.fullName']);

    // Utilisateur simple : seulement ses enregistrements
    if (!this.isAdmin(user)) qb.andWhere('v.createdById = :me', { me: user.id });
    else if (query.createdById) qb.andWhere('v.createdById = :uid', { uid: query.createdById });

    if (query.registrationType) qb.andWhere('v.registrationType = :type', { type: query.registrationType });
    if (query.status) qb.andWhere('v.status = :status', { status: query.status });
    if (query.transmission) qb.andWhere('v.transmission = :tr', { tr: query.transmission });
    if (query.brand) qb.andWhere('v.brand LIKE :brand', { brand: `%${query.brand}%` });
    if (query.city) qb.andWhere('v.city LIKE :city', { city: `%${query.city}%` });
    if (query.yearMin !== undefined) qb.andWhere('v.year >= :yearMin', { yearMin: query.yearMin });
    if (query.yearMax !== undefined) qb.andWhere('v.year <= :yearMax', { yearMax: query.yearMax });
    if (query.currency) qb.andWhere('v.currency = :cur', { cur: query.currency });
    // Budget : l'intervalle [priceMin, priceMax] du véhicule croise [priceFrom, priceTo]
    if (query.priceFrom !== undefined) qb.andWhere('v.priceMax >= :pf', { pf: query.priceFrom });
    if (query.priceTo !== undefined) qb.andWhere('v.priceMin <= :pt', { pt: query.priceTo });
    if (query.hasBroker === 'true') qb.andWhere("v.brokerName IS NOT NULL AND v.brokerName <> ''");
    if (query.hasBroker === 'false') qb.andWhere("(v.brokerName IS NULL OR v.brokerName = '')");

    const search = query.search;
    if (search) {
      const kw = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      // Téléphone trouvé quel que soit le format (0991234567, +243 991 234 567…)
      const digits = search.replace(/\D/g, '').replace(/^(00)?243/, '').replace(/^0+/, '');
      const usePhone = digits.length >= 6 && digits.length <= 15;
      const clean = (col: string) => `REPLACE(REPLACE(REPLACE(REPLACE(${col}, ' ', ''), '-', ''), '+', ''), '.', '')`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('v.name LIKE :kw', { kw })
            .orWhere('v.brand LIKE :kw', { kw })
            .orWhere('v.reference LIKE :kw', { kw })
            .orWhere("REPLACE(REPLACE(UPPER(v.plateNumber), ' ', ''), '-', '') LIKE :plate", {
              plate: `%${this.compactPlate(search.toUpperCase())}%`,
            })
            .orWhere('v.ownerName LIKE :kw', { kw })
            .orWhere('v.ownerPhone LIKE :kw', { kw })
            .orWhere('v.brokerName LIKE :kw', { kw })
            .orWhere('v.brokerPhone LIKE :kw', { kw })
            .orWhere('v.locationAddress LIKE :kw', { kw })
            .orWhere('v.city LIKE :kw', { kw });
          if (usePhone) {
            w.orWhere(`${clean('v.ownerPhone')} LIKE :ph`, { ph: `%${digits}%` }).orWhere(`${clean('v.brokerPhone')} LIKE :ph`, {
              ph: `%${digits}%`,
            });
          }
        }),
      );
    }

    const [items, total] = await qb
      .orderBy('v.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { message: this.t('vehicle_registration.list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    const vehicle = await this.load(id, lang);
    this.assertAccess(vehicle, user, lang);
    return { message: this.t('vehicle_registration.detail', lang), data: vehicle };
  }

  // ============================================================
  // MODIFIER
  // ============================================================

  async update(
    id: string,
    dto: UpdateVehicleRegistrationDto,
    files: Express.Multer.File[] | undefined,
    user: UserEntity,
    lang: string,
  ) {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(this.t('vehicle_registration.not_found', lang));
    this.assertAccess(vehicle, user, lang);

    this.applyDto(vehicle, dto);
    if (dto.clearBroker) {
      vehicle.brokerName = null;
      vehicle.brokerPhone = null;
      vehicle.brokerAmount = null;
    }
    if (dto.currency !== undefined) vehicle.currency = dto.currency.toUpperCase();
    this.validate(vehicle, lang, dto.priceMax !== undefined);
    if (dto.plateNumber !== undefined) await this.assertPlateFree(vehicle.plateNumber, lang, vehicle.id);

    // Images : on garde celles qui ne sont pas retirées, puis on ajoute les nouvelles
    const current = vehicle.images ?? [];
    const toRemove = new Set((dto.removeImages ?? []).filter((u) => current.includes(u)));
    const kept = current.filter((u) => !toRemove.has(u));
    if (kept.length + (files?.length ?? 0) > VEHICLE_MAX_IMAGES) {
      throw new BadRequestException(this.t('vehicle_registration.too_many_images', lang, { max: VEHICLE_MAX_IMAGES }));
    }

    const added = await this.uploadImages(files);
    try {
      vehicle.images = [...kept, ...added];
      vehicle.updatedById = user?.id ?? null;
      await this.repo.save(vehicle);
    } catch (error) {
      await this.deleteImages(added);
      throw error;
    }
    // Fichiers retirés supprimés seulement une fois la fiche enregistrée
    await this.deleteImages([...toRemove]);

    return { message: this.t('vehicle_registration.updated', lang, { reference: vehicle.reference }), data: await this.load(id, lang) };
  }

  async updateStatus(id: string, dto: UpdateVehicleRegistrationStatusDto, user: UserEntity, lang: string) {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(this.t('vehicle_registration.not_found', lang));
    this.assertAccess(vehicle, user, lang);

    vehicle.status = dto.status;
    if (dto.notes !== undefined) vehicle.notes = dto.notes;
    vehicle.updatedById = user?.id ?? null;
    await this.repo.save(vehicle);
    return {
      message: this.t('vehicle_registration.status_updated', lang, { reference: vehicle.reference, status: dto.status }),
      data: await this.load(id, lang),
    };
  }

  // ============================================================
  // SUPPRIMER (suppression douce : la fiche et ses images restent en base)
  // ============================================================

  async remove(id: string, user: UserEntity, lang: string) {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(this.t('vehicle_registration.not_found', lang));
    this.assertAccess(vehicle, user, lang);
    vehicle.updatedById = user?.id ?? null;
    await this.repo.save(vehicle);
    await this.repo.softDelete({ id });
    return { message: this.t('vehicle_registration.deleted', lang, { reference: vehicle.reference }), data: { id } };
  }
}
