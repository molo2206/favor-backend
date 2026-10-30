import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { DriverVehicle } from './entity/DriverVehicle.entity';
import { CreateDriverVehicleByAdminDto } from './dto/create-driver-vehicle-byadmin.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { UpdateVehicleCommissionDto } from './dto/update-vehicle-commission.dto';
import { AdminDriverVehicleQueryDto, AdminUpdateDriverVehicleDto, ReviewVehicleKycDto } from './dto/admin-driver-vehicle.dto';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { resolveChannels } from 'src/notification/utils/platform-channel';
import { NotificationType } from 'src/notification/type/notification.type';
import { I18nService } from 'src/libs/common/src';
import { DriverProfile, DriverType } from '../DriverAssociation/entity/driver-profile.entity';

type VehicleFiles = {
  registration?: Express.Multer.File;
  assurance?: Express.Multer.File;
  permi?: Express.Multer.File;
  photos?: Express.Multer.File[];
};

@Injectable()
export class DriverVehicleService {
  constructor(
    @InjectRepository(DriverVehicle)
    private vehicleRepo: Repository<DriverVehicle>,
    @InjectRepository(UserEntity)
    private userrepo: Repository<UserEntity>,
    private readonly filesService: FilesService,
    // ✅ Notification au chauffeur (documents validés / refusés, véhicule modifié par l'admin)
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => FcmService))
    private readonly fcmService: FcmService,
    private readonly i18n: I18nService,
    // ✅ Chauffeur privé / membre d'une association
    @InjectRepository(DriverProfile)
    private readonly profileRepo: Repository<DriverProfile>,
  ) {}

  private readonly logger = new Logger(DriverVehicleService.name);

  /** Le chauffeur ne fixe jamais lui-même la commission ni le statut de ses documents */
  private stripAdminFields(dto: any) {
    const { commissionRate: _c, kycStatus: _k, kycRejectionReason: _r, kycReviewedAt: _rv, kycSubmittedAt: _s, ...safe } = dto ?? {};
    return safe;
  }

  // CREATE
  async createByadmin(
    dto: CreateDriverVehicleByAdminDto,
    files?: {
      registration?: Express.Multer.File;
      assurance?: Express.Multer.File;
      permi?: Express.Multer.File;
      photos?: Express.Multer.File[];
    },
  ) {
    // Vérifier si le chauffeur existe
    const driver = await this.userrepo.findOne({
      where: { id: dto.driverId },
    });

    if (!driver) {
      throw new NotFoundException('Chauffeur non trouvé');
    }

    // Vérifier duplication plaque pour ce chauffeur
    const exists = await this.vehicleRepo.findOne({
      where: {
        driverId: dto.driverId,
        plateNumber: dto.plateNumber,
        isActive: true,
      },
    });

    if (exists) {
      throw new ConflictException('Ce véhicule existe déjà pour ce chauffeur');
    }

    // Vérifier si la plaque est déjà utilisée par un autre véhicule
    const existingPlate = await this.vehicleRepo.findOne({
      where: { plateNumber: dto.plateNumber },
    });

    if (existingPlate && existingPlate.driverId !== dto.driverId) {
      throw new ConflictException(
        'Ce numéro de plaque est déjà utilisé par un autre chauffeur',
      );
    }

    // Si isDefault = true → désactiver les autres
    if (dto.isDefault) {
      await this.vehicleRepo.update(
        { driverId: dto.driverId },
        { isDefault: false },
      );
    }

    // 📌 Upload des documents et photos (stockage du serveur — FilesService)
    const uploadedUrls: any = {};

    try {
      // Upload carte grise
      if (files?.registration) {
        uploadedUrls.registrationUrl = await this.filesService.uploadDocumentUrl(
          files.registration,
          'driver-vehicles/registrations',
        );
      }

      // Upload assurance
      if (files?.assurance) {
        uploadedUrls.assuranceUrl = await this.filesService.uploadDocumentUrl(
          files.assurance,
          'driver-vehicles/insurances',
        );
      }

      // Upload permis
      if (files?.permi) {
        uploadedUrls.permiUrl = await this.filesService.uploadDocumentUrl(
          files.permi,
          'driver-vehicles/licenses',
        );
      }

      // Upload photos
      if (files?.photos?.length) {
        const photoUrls = await Promise.all(
          files.photos.map((file) =>
            this.filesService.uploadImageUrl(
              file,
              `driver-vehicles/photos/${dto.driverId}`,
            ),
          ),
        );
        uploadedUrls.photos = photoUrls;
      }

      // Mettre à jour le statut KYC
      if (
        files?.registration ||
        files?.assurance ||
        files?.permi ||
        files?.photos?.length
      ) {
        uploadedUrls.kycStatus = 'PENDING';
        uploadedUrls.kycSubmittedAt = new Date();
      }

      // Créer le véhicule avec les URLs uploadées
      const vehicleData = {
        ...dto,
        ...uploadedUrls,
      };

      const vehicle = this.vehicleRepo.create(vehicleData);
      const saved = await this.vehicleRepo.save(vehicle);

      return {
        message: 'Véhicule créé avec succès',
        data: saved,
      };
    } catch (error) {
      // En cas d'erreur, supprimer les fichiers déjà uploadés
      if (uploadedUrls.registrationUrl) {
        await this.filesService
          .deleteFileByUrl(uploadedUrls.registrationUrl)
          .catch(() => {});
      }
      if (uploadedUrls.assuranceUrl) {
        await this.filesService
          .deleteFileByUrl(uploadedUrls.assuranceUrl)
          .catch(() => {});
      }
      if (uploadedUrls.permiUrl) {
        await this.filesService
          .deleteFileByUrl(uploadedUrls.permiUrl)
          .catch(() => {});
      }
      if (uploadedUrls.photos?.length) {
        await Promise.all(
          uploadedUrls.photos.map((photo) =>
            this.filesService.deleteFileByUrl(photo).catch(() => {}),
          ),
        );
      }

      throw error;
    }
  }

  async create(
    dto: CreateDriverVehicleDto,
    user: UserEntity,
    files?: {
      registration?: Express.Multer.File;
      assurance?: Express.Multer.File;
      permi?: Express.Multer.File;
      photos?: Express.Multer.File[];
    },
  ) {
    // Vérifier si le chauffeur a déjà un véhicule actif
    const existingVehicle = await this.vehicleRepo.findOne({
      where: {
        driverId: user.id,
        isActive: true,
      },
    });

    if (existingVehicle) {
      throw new ConflictException(
        "Vous avez déjà un véhicule actif. Veuillez désactiver l'ancien véhicule avant d'en ajouter un nouveau.",
      );
    }

    // Vérifier si la plaque est déjà utilisée
    const existingPlate = await this.vehicleRepo.findOne({
      where: { plateNumber: dto.plateNumber },
    });

    if (existingPlate) {
      throw new ConflictException('Ce numéro de plaque est déjà utilisé');
    }

    // 📌 Upload des documents et photos (stockage du serveur — FilesService)
    const uploadedUrls: any = {};

    // Upload carte grise
    if (files?.registration) {
      uploadedUrls.registrationUrl = await this.filesService.uploadDocumentUrl(
        files.registration,
        'driver-vehicles/registrations',
      );
    }

    // Upload assurance
    if (files?.assurance) {
      uploadedUrls.assuranceUrl = await this.filesService.uploadDocumentUrl(
        files.assurance,
        'driver-vehicles/insurances',
      );
    }

    // Upload permis
    if (files?.permi) {
      uploadedUrls.permiUrl = await this.filesService.uploadDocumentUrl(
        files.permi,
        'driver-vehicles/licenses',
      );
    }

    // Upload photos
    if (files?.photos?.length) {
      const photoUrls = await Promise.all(
        files.photos.map((file) =>
          this.filesService.uploadImageUrl(
            file,
            `driver-vehicles/photos/${user.id}`,
          ),
        ),
      );
      uploadedUrls.photos = photoUrls;
    }

    // Créer le véhicule (commission et statut des documents : fixés par l'administrateur, jamais par le chauffeur)
    const safeDto = this.stripAdminFields(dto);
    const vehicle = this.vehicleRepo.create({
      ...safeDto,
      ...uploadedUrls,
      driverId: user.id,
      isActive: true,
      isDefault: true, // Le seul véhicule est automatiquement par défaut
    });

    const saved = await this.vehicleRepo.save(vehicle);

    return {
      message: 'Véhicule créé avec succès',
      data: saved,
    };
  }

  // LIST BY DRIVER
  async findAllByDriver(driverId: string) {
    const vehicles = await this.vehicleRepo.find({
      where: { driverId, isActive: true },
      relations: ['category', 'category.parent', 'category.children'],
    });

    return {
      message: 'Liste des véhicules',
      data: vehicles,
    };
  }

  // FIND ONE
  async findOne(id: string) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id },
      relations: ['category', 'category.parent', 'category.children'],
    });

    if (!vehicle) {
      throw new NotFoundException('Véhicule introuvable');
    }

    return {
      message: 'Détail du véhicule',
      data: vehicle,
    };
  }

  // UPDATE
  async update(
    id: string,
    dto: UpdateDriverVehicleDto,
    user: UserEntity,
    files?: {
      registration?: Express.Multer.File;
      assurance?: Express.Multer.File;
      permi?: Express.Multer.File;
      photos?: Express.Multer.File[];
    },
  ) {
    // Vérifier si le véhicule existe et appartient à l'utilisateur
    const vehicle = await this.vehicleRepo.findOne({
      where: {
        id,
        driverId: user.id,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Véhicule non trouvé');
    }

    // Vérifier si la plaque est déjà utilisée par un autre véhicule
    if (dto.plateNumber && dto.plateNumber !== vehicle.plateNumber) {
      const existingPlate = await this.vehicleRepo.findOne({
        where: { plateNumber: dto.plateNumber },
      });

      if (existingPlate) {
        throw new ConflictException('Ce numéro de plaque est déjà utilisé');
      }
    }

    // Si isDefault = true → désactiver les autres
    if (dto.isDefault) {
      await this.vehicleRepo.update(
        { driverId: user.id },
        { isDefault: false },
      );
    }

    // 📌 Upload des documents et photos (stockage du serveur — FilesService)
    const uploadedUrls: any = {};

    // Upload carte grise
    if (files?.registration) {
      // Supprimer l'ancien fichier si existant
      if (vehicle.registrationUrl) {
        await this.filesService.deleteFileByUrl(vehicle.registrationUrl);
      }
      uploadedUrls.registrationUrl = await this.filesService.uploadDocumentUrl(
        files.registration,
        'driver-vehicles/registrations',
      );
    }

    // Upload assurance
    if (files?.assurance) {
      if (vehicle.assuranceUrl) {
        await this.filesService.deleteFileByUrl(vehicle.assuranceUrl);
      }
      uploadedUrls.assuranceUrl = await this.filesService.uploadDocumentUrl(
        files.assurance,
        'driver-vehicles/insurances',
      );
    }

    // Upload permis
    if (files?.permi) {
      if (vehicle.permiUrl) {
        await this.filesService.deleteFileByUrl(vehicle.permiUrl);
      }
      uploadedUrls.permiUrl = await this.filesService.uploadDocumentUrl(
        files.permi,
        'driver-vehicles/licenses',
      );
    }

    // Upload photos du véhicule
    const photos = files?.photos;
    if (photos && photos.length > 0) {
      // Optionnel: Supprimer les anciennes photos si on veut remplacer
      if (dto.photos && vehicle.photos?.length) {
        await Promise.all(
          vehicle.photos.map((photoUrl) =>
            this.filesService.deleteFileByUrl(photoUrl).catch(() => {}),
          ),
        );
      }

      const photoUrls = await Promise.all(
        photos.map((file) =>
          this.filesService.uploadImageUrl(
            file,
            `driver-vehicles/photos/${user.id}`,
          ),
        ),
      );

      // Si replacePhotos est true, on remplace, sinon on ajoute
      if (dto.photos) {
        uploadedUrls.photos = photoUrls;
      } else {
        uploadedUrls.photos = [...(vehicle.photos || []), ...photoUrls];
      }
    }

    // Mettre à jour le statut KYC si des documents sont uploadés
    if (Object.keys(uploadedUrls).length > 0) {
      uploadedUrls.kycStatus = 'PENDING';
      uploadedUrls.kycSubmittedAt = new Date();
    }

    // Fusionner les modifications (commission et validation des documents : routes admin uniquement)
    const safeDto = this.stripAdminFields(dto);
    const updatedVehicle = this.vehicleRepo.create({
      ...vehicle,
      ...safeDto,
      ...uploadedUrls,
    });

    const saved = await this.vehicleRepo.save(updatedVehicle);

    return {
      message: 'Véhicule mis à jour avec succès',
      data: saved,
    };
  }

  // ============================================================
  // ✅ ADMINISTRATION : liste, fiche, modification, validation des documents
  // ============================================================

  private driverLang(driver?: UserEntity | null): string {
    const lang = (driver as any)?.settings?.language || 'fr';
    return ['fr', 'en', 'sw', 'es', 'ar'].includes(lang) ? lang : 'fr';
  }

  /** Vue complète d'un véhicule pour l'admin */
  private adminView(v: DriverVehicle, profile?: DriverProfile | null) {
    const isMember = profile?.type === DriverType.ASSOCIATION && !!profile.association;
    const docs = [
      { key: 'registration', label: 'Carte grise', url: v.registrationUrl ?? null },
      { key: 'assurance', label: 'Assurance', url: v.assuranceUrl ?? null },
      { key: 'permi', label: 'Permis de conduire', url: v.permiUrl ?? null },
    ];
    return {
      id: v.id,
      model: v.model,
      plateNumber: v.plateNumber,
      color: v.color,
      year: v.year,
      isActive: v.isActive,
      isDefault: v.isDefault,
      category: v.category ? { id: v.category.id, name: (v.category as any).name, image: (v.category as any).image ?? null } : { id: v.categoryId },
      driver: v.driver
        ? { id: v.driver.id, fullName: (v.driver as any).fullName, phone: (v.driver as any).phone, email: (v.driver as any).email, image: (v.driver as any).image ?? null }
        : { id: v.driverId },
      commissionRate: v.commissionRate != null ? Number(v.commissionRate) : null,
      effectiveCommissionRate: DriverVehicleService.effectiveCommissionRate(v),
      // ✅ Statut du chauffeur
      driverType: isMember ? DriverType.ASSOCIATION : DriverType.PRIVATE,
      association: isMember
        ? { id: profile!.association!.id, name: profile!.association!.name, commissionRate: Number(profile!.association!.commissionRate || 0) }
        : null,
      memberNumber: isMember ? profile?.memberNumber ?? null : null,
      kyc: {
        status: v.kycStatus,
        rejectionReason: v.kycRejectionReason ?? null,
        submittedAt: v.kycSubmittedAt ?? null,
        reviewedAt: v.kycReviewedAt ?? null,
        documents: docs,
        missingDocuments: docs.filter((d) => !d.url).map((d) => d.key),
        photos: v.photos ?? [],
      },
      // Champs d'origine (compatibilité avec les écrans existants)
      registrationUrl: v.registrationUrl ?? null,
      assuranceUrl: v.assuranceUrl ?? null,
      permiUrl: v.permiUrl ?? null,
      photos: v.photos ?? [],
      kycStatus: v.kycStatus,
      kycRejectionReason: v.kycRejectionReason ?? null,
      kycSubmittedAt: v.kycSubmittedAt ?? null,
      kycReviewedAt: v.kycReviewedAt ?? null,
    };
  }

  /** Admin : véhicules de tous les chauffeurs (filtres, recherche, pagination, compteurs par statut) */
  async adminList(query: AdminDriverVehicleQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = this.vehicleRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.driver', 'driver')
      .leftJoinAndSelect('v.category', 'category');
    const active = query.active ?? 'true';
    if (active !== 'all') qb.andWhere('v.isActive = :active', { active: active === 'true' });
    if (query.driverId) qb.andWhere('v.driverId = :driverId', { driverId: query.driverId });
    if (query.categoryId) qb.andWhere('v.categoryId = :categoryId', { categoryId: query.categoryId });
    // ✅ Filtre privé / association
    if (query.driverType || query.associationId) {
      qb.leftJoin(DriverProfile, 'dp', 'dp.driverId = v.driverId');
      if (query.associationId) {
        qb.andWhere('dp.type = :member AND dp.associationId = :assoc', { member: DriverType.ASSOCIATION, assoc: query.associationId });
      } else if (query.driverType === 'ASSOCIATION') {
        qb.andWhere('dp.type = :member AND dp.associationId IS NOT NULL', { member: DriverType.ASSOCIATION });
      } else {
        qb.andWhere('(dp.id IS NULL OR dp.type = :private OR dp.associationId IS NULL)', { private: DriverType.PRIVATE });
      }
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('v.model LIKE :q', { q })
            .orWhere('v.plateNumber LIKE :q', { q })
            .orWhere('v.color LIKE :q', { q })
            .orWhere('driver.fullName LIKE :q', { q })
            .orWhere('driver.phone LIKE :q', { q }),
        ),
      );
    }

    // Compteurs par statut (mêmes filtres, sans le filtre de statut)
    const countsRaw = await qb
      .clone()
      .select('v.kycStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('v.kycStatus')
      .getRawMany();
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
    for (const r of countsRaw) counts[r.status] = Number(r.count || 0);

    if (query.kycStatus) qb.andWhere('v.kycStatus = :kyc', { kyc: query.kycStatus });
    // Les dossiers à valider d'abord (PENDING), puis du plus ancien au plus récent.
    // ✅ TypeORM (pagination + jointures) : le tri doit porter sur une colonne ou une sélection nommée,
    //    pas sur une expression brute → l'expression CASE est sélectionnée sous le nom kyc_order.
    qb.addSelect("CASE WHEN v.kycStatus = 'PENDING' THEN 0 ELSE 1 END", 'kyc_order')
      .orderBy('kyc_order', 'ASC')
      .addOrderBy('v.kycSubmittedAt', 'ASC')
      .addOrderBy('v.id', 'ASC')
      // Jointures « un seul » (chauffeur, catégorie) : offset / limit suffisent (pas de doublons de lignes)
      .offset((page - 1) * limit)
      .limit(limit);

    const [rows, total] = await qb.getManyAndCount();
    const profiles = await this.profilesFor(rows.map((v) => v.driverId));
    return {
      message: 'Liste des véhicules des chauffeurs',
      data: rows.map((v) => this.adminView(v, profiles.get(v.driverId))),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), counts },
    };
  }

  /** Statut (privé / association) de plusieurs chauffeurs */
  private async profilesFor(driverIds: string[]): Promise<Map<string, DriverProfile>> {
    const ids = [...new Set(driverIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const list = await this.profileRepo.find({ where: { driverId: In(ids) }, relations: ['association'] });
    return new Map(list.map((p) => [p.driverId, p] as [string, DriverProfile]));
  }

  /** Admin : fiche complète d'un véhicule */
  async adminFindOne(id: string) {
    const v = await this.vehicleRepo.findOne({ where: { id }, relations: ['driver', 'category'] });
    if (!v) throw new NotFoundException('Véhicule introuvable');
    const profiles = await this.profilesFor([v.driverId]);
    return { message: 'Détail du véhicule', data: this.adminView(v, profiles.get(v.driverId)) };
  }

  /** Admin : modifier n'importe quel champ et remplacer / retirer les documents */
  async adminUpdate(id: string, dto: AdminUpdateDriverVehicleDto, admin: UserEntity, files?: VehicleFiles) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable');

    const driverId = dto.driverId ?? vehicle.driverId;
    if (dto.driverId && dto.driverId !== vehicle.driverId) {
      const driver = await this.userrepo.findOne({ where: { id: dto.driverId } });
      if (!driver) throw new NotFoundException('Chauffeur non trouvé');
    }

    if (dto.plateNumber && dto.plateNumber !== vehicle.plateNumber) {
      const other = await this.vehicleRepo.findOne({ where: { plateNumber: dto.plateNumber } });
      if (other && other.id !== vehicle.id) throw new ConflictException('Ce numéro de plaque est déjà utilisé');
    }

    // Documents : remplacement (ancien fichier supprimé) ou retrait
    const folder = 'driver-vehicles';
    const docs: { key: 'registration' | 'assurance' | 'permi'; field: 'registrationUrl' | 'assuranceUrl' | 'permiUrl'; dir: string }[] = [
      { key: 'registration', field: 'registrationUrl', dir: `${folder}/registrations` },
      { key: 'assurance', field: 'assuranceUrl', dir: `${folder}/insurances` },
      { key: 'permi', field: 'permiUrl', dir: `${folder}/licenses` },
    ];
    for (const d of docs) {
      const file = files?.[d.key];
      const remove = dto.removeDocuments?.includes(d.key);
      if (file || remove) {
        const old = vehicle[d.field];
        if (old) await this.filesService.deleteFileByUrl(old).catch(() => false);
        (vehicle as any)[d.field] = file ? await this.filesService.uploadDocumentUrl(file, d.dir) : null;
      }
    }

    // Photos : retrait, remplacement ou ajout
    let photos = [...(vehicle.photos ?? [])];
    if (dto.removePhotos?.length) {
      for (const url of dto.removePhotos) await this.filesService.deleteFileByUrl(url).catch(() => false);
      photos = photos.filter((p) => !dto.removePhotos!.includes(p));
    }
    if (files?.photos?.length) {
      const uploaded = await Promise.all(files.photos.map((f) => this.filesService.uploadImageUrl(f, `${folder}/photos/${driverId}`)));
      if (dto.replacePhotos) {
        for (const url of photos) await this.filesService.deleteFileByUrl(url).catch(() => false);
        photos = uploaded;
      } else photos = [...photos, ...uploaded];
    }
    vehicle.photos = photos.slice(0, 10);

    // Champs simples
    if (dto.driverId) vehicle.driverId = dto.driverId;
    if (dto.categoryId) vehicle.categoryId = dto.categoryId;
    if (dto.model !== undefined) vehicle.model = dto.model;
    if (dto.plateNumber !== undefined) vehicle.plateNumber = dto.plateNumber;
    if (dto.color !== undefined) vehicle.color = dto.color;
    if (dto.year !== undefined) vehicle.year = dto.year;
    if (dto.isActive !== undefined) vehicle.isActive = dto.isActive;
    if (dto.commissionRate !== undefined) vehicle.commissionRate = dto.commissionRate;

    // Statut des documents fixé par l'admin
    const previousKyc = vehicle.kycStatus;
    if (dto.kycStatus) {
      if (dto.kycStatus === 'REJECTED' && !(dto.kycRejectionReason || vehicle.kycRejectionReason)) {
        throw new BadRequestException('Indiquez le motif du refus (kycRejectionReason)');
      }
      vehicle.kycStatus = dto.kycStatus;
      vehicle.kycReviewedAt = dto.kycStatus === 'PENDING' ? (null as any) : new Date();
      vehicle.kycRejectionReason = dto.kycStatus === 'REJECTED' ? (dto.kycRejectionReason ?? vehicle.kycRejectionReason) : (null as any);
    }

    if (dto.isDefault) {
      await this.vehicleRepo.update({ driverId }, { isDefault: false });
      vehicle.isDefault = true;
    } else if (dto.isDefault === false) vehicle.isDefault = false;

    await this.vehicleRepo.save(vehicle);
    const fresh = await this.vehicleRepo.findOne({ where: { id }, relations: ['driver', 'driver.settings', 'category'] });

    if (fresh && dto.kycStatus && dto.kycStatus !== previousKyc && dto.kycStatus !== 'PENDING') {
      await this.notifyDriverKyc(fresh, admin);
    } else if (fresh) {
      await this.notifyDriver(fresh, 'updated', {});
    }
    const freshProfile = fresh ? (await this.profilesFor([fresh.driverId])).get(fresh.driverId) : null;
    return { message: 'Véhicule mis à jour par l\'administration', data: fresh ? this.adminView(fresh, freshProfile) : null };
  }

  /** Admin : valider ou refuser les documents (carte grise, assurance, permis, photos) */
  async reviewKyc(id: string, dto: ReviewVehicleKycDto, admin: UserEntity) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id }, relations: ['driver', 'driver.settings', 'category'] });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable');

    if (dto.status === 'APPROVED') {
      const missing = [
        !vehicle.registrationUrl && 'carte grise',
        !vehicle.assuranceUrl && 'assurance',
        !vehicle.permiUrl && 'permis',
      ].filter(Boolean);
      const allowIncomplete = String(process.env.DRIVER_KYC_ALLOW_INCOMPLETE ?? 'false').toLowerCase() === 'true';
      if (missing.length && !allowIncomplete) {
        throw new BadRequestException(`Documents manquants : ${missing.join(', ')}. Le chauffeur doit les envoyer avant la validation.`);
      }
    }

    vehicle.kycStatus = dto.status;
    vehicle.kycReviewedAt = new Date();
    vehicle.kycRejectionReason = dto.status === 'REJECTED' ? (dto.reason ?? null) as any : (null as any);
    await this.vehicleRepo.save(vehicle);
    await this.notifyDriverKyc(vehicle, admin);

    return {
      message: dto.status === 'APPROVED' ? 'Documents du véhicule validés' : 'Documents du véhicule refusés',
      data: this.adminView(vehicle, (await this.profilesFor([vehicle.driverId])).get(vehicle.driverId)),
    };
  }

  private async notifyDriverKyc(vehicle: DriverVehicle, admin?: UserEntity) {
    const key = vehicle.kycStatus === 'APPROVED' ? 'kyc_approved' : 'kyc_rejected';
    await this.notifyDriver(vehicle, key, { reason: vehicle.kycRejectionReason ?? '', reviewedBy: (admin as any)?.fullName ?? '' });
  }

  /** Notification au chauffeur : WebSocket + liste des notifications + push Firebase — ne lève jamais d'erreur */
  private async notifyDriver(vehicle: DriverVehicle, key: 'kyc_approved' | 'kyc_rejected' | 'updated', extra: Record<string, any>) {
    try {
      const driver = vehicle.driver ?? (await this.userrepo.findOne({ where: { id: vehicle.driverId }, relations: ['settings'] }));
      if (!driver) return;
      const lang = this.driverLang(driver);
      const params = { model: vehicle.model, plate: vehicle.plateNumber, ...extra };
      const title = this.i18n.translate(`driver_vehicle.notif.${key}.title`, lang, params);
      const body = this.i18n.translate(`driver_vehicle.notif.${key}.body`, lang, params);
      const data = {
        category: 'driver_vehicle',
        action: key,
        vehicleId: vehicle.id,
        kycStatus: vehicle.kycStatus,
        reason: vehicle.kycRejectionReason ?? '',
      };
      // ✅ Seulement dans Favor Driver (pas dans l'application client du chauffeur)
      const channels = resolveChannels(NotificationType.VEHICLE_KYC);
      await this.notificationsService.sendAndSaveNotification(driver.id, title, body, NotificationType.VEHICLE_KYC, data, { channels });
      await this.fcmService.sendPushToUsers([driver.id], title, body, data, { tag: `vehicle-${vehicle.id}`, channels });
    } catch (e: any) {
      this.logger.warn(`Notification chauffeur (véhicule ${vehicle.id}) : ${e?.message}`);
    }
  }

  // ============================================================
  // ✅ COMMISSION PAR VÉHICULE (admin)
  // ============================================================

  /** Commission par défaut (.env RIDE_DEFAULT_COMMISSION_RATE, 0 si absente) */
  static defaultCommissionRate(): number {
    const v = Number(process.env.RIDE_DEFAULT_COMMISSION_RATE ?? 0);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  /** Commission effective d'un véhicule : la sienne, sinon la valeur par défaut */
  static effectiveCommissionRate(vehicle?: Pick<DriverVehicle, 'commissionRate'> | null): number {
    const own = vehicle?.commissionRate;
    if (own !== null && own !== undefined && String(own) !== '' && Number.isFinite(Number(own))) return Number(own);
    return DriverVehicleService.defaultCommissionRate();
  }

  async setCommission(id: string, dto: UpdateVehicleCommissionDto) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable');
    vehicle.commissionRate = dto.commissionRate === undefined ? vehicle.commissionRate : dto.commissionRate;
    const saved = await this.vehicleRepo.save(vehicle);
    return {
      message: 'Commission du véhicule mise à jour',
      data: {
        ...saved,
        effectiveCommissionRate: DriverVehicleService.effectiveCommissionRate(saved),
      },
    };
  }

  /** Liste admin : véhicules et commissions (filtre chauffeur / catégorie) */
  async listWithCommission(query: { driverId?: string; categoryId?: string }) {
    const where: any = { isActive: true };
    if (query.driverId) where.driverId = query.driverId;
    if (query.categoryId) where.categoryId = query.categoryId;
    const vehicles = await this.vehicleRepo.find({ where, relations: ['category', 'driver'], order: { model: 'ASC' } });
    return {
      message: 'Liste des véhicules',
      data: vehicles.map((v) => ({
        id: v.id,
        model: v.model,
        plateNumber: v.plateNumber,
        color: v.color,
        year: v.year,
        kycStatus: v.kycStatus,
        category: v.category ? { id: v.category.id, name: (v.category as any).name } : null,
        driver: v.driver ? { id: v.driver.id, fullName: (v.driver as any).fullName, phone: (v.driver as any).phone } : { id: v.driverId },
        commissionRate: v.commissionRate != null ? Number(v.commissionRate) : null,
        effectiveCommissionRate: DriverVehicleService.effectiveCommissionRate(v),
      })),
    };
  }

  // DELETE (soft) — ✅ le chauffeur propriétaire ou un admin
  async remove(id: string, user?: UserEntity) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });

    if (!vehicle) {
      throw new NotFoundException('Véhicule introuvable');
    }
    const role = String((user as any)?.role || '').toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'SUPER ADMIN';
    if (user && !isAdmin && vehicle.driverId !== user.id) {
      throw new ForbiddenException('Ce véhicule ne vous appartient pas');
    }

    vehicle.isActive = false;
    const deleted = await this.vehicleRepo.save(vehicle);

    return {
      message: 'Véhicule supprimé',
      data: deleted,
    };
  }
}
