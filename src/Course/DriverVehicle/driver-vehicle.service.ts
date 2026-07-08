import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { DriverVehicle } from './entity/DriverVehicle.entity';
import { CreateDriverVehicleByAdminDto } from './dto/create-driver-vehicle-byadmin.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class DriverVehicleService {
  constructor(
    @InjectRepository(DriverVehicle)
    private vehicleRepo: Repository<DriverVehicle>,
    @InjectRepository(UserEntity)
    private userrepo: Repository<UserEntity>,
    private readonly cloudinary: CloudinaryService,
  ) {}

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

    // 📌 Upload des documents et photos vers Cloudinary
    const uploadedUrls: any = {};

    try {
      // Upload carte grise
      if (files?.registration) {
        uploadedUrls.registrationUrl = await this.cloudinary.handleUploadFile(
          files.registration,
          'driver-vehicles/registrations',
        );
      }

      // Upload assurance
      if (files?.assurance) {
        uploadedUrls.assuranceUrl = await this.cloudinary.handleUploadFile(
          files.assurance,
          'driver-vehicles/insurances',
        );
      }

      // Upload permis
      if (files?.permi) {
        uploadedUrls.permiUrl = await this.cloudinary.handleUploadFile(
          files.permi,
          'driver-vehicles/licenses',
        );
      }

      // Upload photos
      if (files?.photos?.length) {
        const photoUrls = await Promise.all(
          files.photos.map((file) =>
            this.cloudinary.handleUploadImage(
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
        await this.cloudinary
          .handleDeleteFile(uploadedUrls.registrationUrl)
          .catch(() => {});
      }
      if (uploadedUrls.assuranceUrl) {
        await this.cloudinary
          .handleDeleteFile(uploadedUrls.assuranceUrl)
          .catch(() => {});
      }
      if (uploadedUrls.permiUrl) {
        await this.cloudinary
          .handleDeleteFile(uploadedUrls.permiUrl)
          .catch(() => {});
      }
      if (uploadedUrls.photos?.length) {
        await Promise.all(
          uploadedUrls.photos.map((photo) =>
            this.cloudinary.handleDeleteFile(photo).catch(() => {}),
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

    // 📌 Upload des documents et photos vers Cloudinary
    const uploadedUrls: any = {};

    // Upload carte grise
    if (files?.registration) {
      uploadedUrls.registrationUrl = await this.cloudinary.handleUploadImage(
        files.registration,
        'driver-vehicles/registrations',
      );
    }

    // Upload assurance
    if (files?.assurance) {
      uploadedUrls.assuranceUrl = await this.cloudinary.handleUploadImage(
        files.assurance,
        'driver-vehicles/insurances',
      );
    }

    // Upload permis
    if (files?.permi) {
      uploadedUrls.permiUrl = await this.cloudinary.handleUploadImage(
        files.permi,
        'driver-vehicles/licenses',
      );
    }

    // Upload photos
    if (files?.photos?.length) {
      const photoUrls = await Promise.all(
        files.photos.map((file) =>
          this.cloudinary.handleUploadImage(
            file,
            `driver-vehicles/photos/${user.id}`,
          ),
        ),
      );
      uploadedUrls.photos = photoUrls;
    }

    // Créer le véhicule
    const vehicle = this.vehicleRepo.create({
      ...dto,
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

    // 📌 Upload des documents et photos vers Cloudinary
    const uploadedUrls: any = {};

    // Upload carte grise
    if (files?.registration) {
      // Supprimer l'ancien fichier si existant
      if (vehicle.registrationUrl) {
        await this.cloudinary.handleDeleteImage(vehicle.registrationUrl);
      }
      uploadedUrls.registrationUrl = await this.cloudinary.handleUploadImage(
        files.registration,
        'driver-vehicles/registrations',
      );
    }

    // Upload assurance
    if (files?.assurance) {
      if (vehicle.assuranceUrl) {
        await this.cloudinary.handleDeleteImage(vehicle.assuranceUrl);
      }
      uploadedUrls.assuranceUrl = await this.cloudinary.handleUploadImage(
        files.assurance,
        'driver-vehicles/insurances',
      );
    }

    // Upload permis
    if (files?.permi) {
      if (vehicle.permiUrl) {
        await this.cloudinary.handleDeleteImage(vehicle.permiUrl);
      }
      uploadedUrls.permiUrl = await this.cloudinary.handleUploadImage(
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
            this.cloudinary.handleDeleteImage(photoUrl).catch(() => {}),
          ),
        );
      }

      const photoUrls = await Promise.all(
        photos.map((file) =>
          this.cloudinary.handleUploadImage(
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

    // Fusionner les modifications
    const updatedVehicle = this.vehicleRepo.create({
      ...vehicle,
      ...dto,
      ...uploadedUrls,
    });

    const saved = await this.vehicleRepo.save(updatedVehicle);

    return {
      message: 'Véhicule mis à jour avec succès',
      data: saved,
    };
  }

  // DELETE (soft)
  async remove(id: string) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });

    if (!vehicle) {
      throw new NotFoundException('Véhicule introuvable');
    }

    vehicle.isActive = false;
    const deleted = await this.vehicleRepo.save(vehicle);

    return {
      message: 'Véhicule supprimé',
      data: deleted,
    };
  }
}
