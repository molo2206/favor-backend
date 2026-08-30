import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressUser } from './entities/address-user.entity';
import { CreateAddressUserDto } from './dto/create-address-user.dto';
import { UpdateAddressUserDto } from './dto/update-address-user.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

@Injectable()
export class AddressUserService {
  constructor(
    @InjectRepository(AddressUser)
    private readonly addressUserRepo: Repository<AddressUser>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(Country) // ✅ Ajout du repository Country
    private readonly countryRepo: Repository<Country>,
    @InjectRepository(City) // ✅ Ajout du repository City
    private readonly cityRepo: Repository<City>,
  ) { }

  async create(
    createDto: CreateAddressUserDto,
    user: UserEntity,
  ): Promise<{ data: AddressUser; message: string }> {
    const isDefault = createDto.isDefault === true;

    if (isDefault) {
      await this.addressUserRepo.update(
        { user: { id: user.id }, isDefault: true },
        { isDefault: false },
      );
    }

    if (createDto.countryId) {
      const country = await this.countryRepo.findOne({
        where: { id: createDto.countryId },
      });
      if (!country) {
        throw new NotFoundException(`Pays avec l'ID ${createDto.countryId} non trouvé`);
      }
    }

    if (createDto.cityId) {
      const city = await this.cityRepo.findOne({
        where: { id: createDto.cityId },
      });
      if (!city) {
        throw new NotFoundException(`Ville avec l'ID ${createDto.cityId} non trouvée`);
      }
    }

    // ✅ Utiliser new AddressUser()
    const address = new AddressUser();
    address.firstName = createDto.firstName;
    address.lastName = createDto.lastName;
    address.address = createDto.address;
    address.phone = createDto.phone;
    address.type = createDto.type;
    address.isDefault = isDefault;
    address.user = user;
    address.latitude = Number(createDto.latitude);
    address.longitude = Number(createDto.longitude);
    address.countryId = createDto.countryId || null;
    address.cityId = createDto.cityId || null;

    // ✅ Sauvegarder et caster le résultat
    const savedAddress = await this.addressUserRepo.save(address) as unknown as AddressUser;

    if (isDefault) {
      await this.userRepo.update(user.id, {
        defaultAddressId: savedAddress.id,
      });
    }

    // ✅ Recharger avec les relations
    const addressWithRelations = await this.addressUserRepo.findOne({
      where: { id: savedAddress.id },
      relations: ['country', 'city'],
    });

    return {
      message: 'Adresse créée avec succès',
      data: addressWithRelations || savedAddress,
    };
  }

  async update(
    id: string,
    updateDto: UpdateAddressUserDto,
    user: UserEntity,
  ): Promise<AddressUser> {
    const address = await this.findOne(id, user);

    if (updateDto.isDefault) {
      await this.addressUserRepo.update(
        { user, isDefault: true },
        { isDefault: false },
      );
    }

    if (updateDto.countryId) {
      const country = await this.countryRepo.findOne({
        where: { id: updateDto.countryId },
      });
      if (!country) {
        throw new NotFoundException(`Pays avec l'ID ${updateDto.countryId} non trouvé`);
      }
    }

    if (updateDto.cityId) {
      const city = await this.cityRepo.findOne({
        where: { id: updateDto.cityId },
      });
      if (!city) {
        throw new NotFoundException(`Ville avec l'ID ${updateDto.cityId} non trouvée`);
      }
    }

    Object.assign(address, updateDto);

    // ✅ Sauvegarder et s'assurer d'avoir un objet unique
    const savedAddress = await this.addressUserRepo.save(address);

    // ✅ Vérifier que savedAddress est un objet et non un tableau
    if (Array.isArray(savedAddress)) {
      throw new Error('Erreur lors de la sauvegarde de l\'adresse');
    }

    // ✅ Utiliser savedAddress.id pour recharger
    const addressWithRelations = await this.addressUserRepo.findOne({
      where: { id: savedAddress.id },
      relations: ['country', 'city'],
    });

    return addressWithRelations || savedAddress;
  }


  async updateDefaultAddress(user: UserEntity, addressId: string): Promise<AddressUser> {
    const address = await this.addressUserRepo.findOne({
      where: { id: addressId, user: { id: user.id } },
    });

    if (!address) {
      throw new NotFoundException('Adresse non trouvée pour cet utilisateur');
    }

    // Désactiver les anciennes adresses par défaut
    await this.addressUserRepo.update(
      { user: { id: user.id }, isDefault: true },
      { isDefault: false },
    );

    // Marquer cette adresse comme par défaut
    address.isDefault = true;
    const updatedAddress = await this.addressUserRepo.save(address);

    // Mettre à jour le user
    user.defaultAddress = updatedAddress;
    user.defaultAddressId = updatedAddress.id;
    await this.userRepo.save(user);

    return updatedAddress;
  }

  async findAll(user: UserEntity): Promise<AddressUser[]> {
    return this.addressUserRepo.find({
      where: {
        user: { id: user.id },
      },
      relations: ['country', 'city'], // ✅ Ajout des relations
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: UserEntity): Promise<AddressUser> {
    const address = await this.addressUserRepo.findOne({
      where: { id, user: { id: user.id } }, // ✅ Correction du where
      relations: ['country', 'city'], // ✅ Ajout des relations
    });

    if (!address) {
      throw new NotFoundException(`Address with id ${id} not found`);
    }

    return address;
  }

  async updateDefaultAddressWithData(
    user: UserEntity,
    addressId: string,
    updateDto: UpdateAddressUserDto,
  ): Promise<AddressUser> {
    const address = await this.addressUserRepo.findOne({
      where: { id: addressId, user: { id: user.id } },
    });

    if (!address) {
      throw new NotFoundException('Adresse non trouvée pour cet utilisateur');
    }

    const isDefault = updateDto.isDefault;

    if (typeof isDefault === 'boolean') {
      if (isDefault) {
        // Définir cette adresse comme par défaut → désactiver les autres
        await this.addressUserRepo.update(
          { user: { id: user.id }, isDefault: true },
          { isDefault: false },
        );
        address.isDefault = true;

        // Mettre à jour le user
        await this.userRepo.update(user.id, {
          defaultAddressId: address.id,
        });

        // Facultatif : mettre aussi la relation
        await this.userRepo.save({ ...user, defaultAddress: address });
      } else {
        // Supprimer le statut par défaut
        address.isDefault = false;

        // Si cette adresse était celle du user, on nettoie
        if (user.defaultAddressId === address.id) {
          await this.userRepo.update(user.id, {
            defaultAddressId: undefined,
          });

          await this.userRepo.save({ ...user, defaultAddress: undefined });
        }
      }
    }

    // Mise à jour des autres champs (firstName, phone, etc.)
    Object.assign(address, updateDto);
    return this.addressUserRepo.save(address);
  }


  async remove(id: string, user: UserEntity): Promise<void> {
    const address = await this.findOne(id, user);
    await this.addressUserRepo.remove(address);
  }

  // Récupérer l'adresse par défaut
  async getDefaultAddress(user: UserEntity): Promise<AddressUser> {
    const address = await this.addressUserRepo.findOne({
      where: { user, isDefault: true },
    });

    if (!address) {
      throw new NotFoundException('No default address found for this user');
    }

    return address;
  }
}
