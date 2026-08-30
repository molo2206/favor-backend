import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressUser } from './entities/address-user.entity';
import { CreateAddressUserDto } from './dto/create-address-user.dto';
import { UpdateAddressUserDto } from './dto/update-address-user.dto';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class AddressUserService {
  constructor(
    @InjectRepository(AddressUser)
    private readonly addressUserRepo: Repository<AddressUser>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) { }

  async create(
    createDto: CreateAddressUserDto,
    user: UserEntity,
  ): Promise<{ data: AddressUser; message: string }> {
    const isDefault = createDto.isDefault === true;

    if (isDefault) {
      // Désactiver les anciennes adresses par défaut
      await this.addressUserRepo.update(
        { user: { id: user.id }, isDefault: true },
        { isDefault: false },
      );
    }

    // ✅ Vérifier que le pays existe si countryId est fourni
    if (createDto.countryId) {
      const country = await this.countryRepo.findOne({
        where: { id: createDto.countryId },
      });
      if (!country) {
        throw new NotFoundException(`Pays avec l'ID ${createDto.countryId} non trouvé`);
      }
    }

    // ✅ Vérifier que la ville existe si cityId est fourni
    if (createDto.cityId) {
      const city = await this.cityRepo.findOne({
        where: { id: createDto.cityId },
      });
      if (!city) {
        throw new NotFoundException(`Ville avec l'ID ${createDto.cityId} non trouvée`);
      }
    }

    // Créer et sauvegarder l'adresse
    const address = this.addressUserRepo.create({
      ...createDto,
      isDefault, // toujours défini (true/false)
      user,
      latitude: Number(createDto.latitude),
      longitude: Number(createDto.longitude),
      countryId: createDto.countryId || null,
      cityId: createDto.cityId || null,
    });

    const savedAddress = await this.addressUserRepo.save(address);

    // Mettre à jour l'utilisateur si cette adresse est par défaut
    if (isDefault) {
      await this.userRepo.update(user.id, {
        defaultAddressId: savedAddress.id,
      });

      // Optionnel : si tu veux aussi mettre la relation (non seulement l'id)
      await this.userRepo.save({
        ...user,
        defaultAddress: savedAddress,
      });
    }

    // ✅ Recharger l'adresse avec les relations country et city
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
      // Désactiver les autres adresses par défaut avant de mettre à jour
      await this.addressUserRepo.update(
        { user, isDefault: true },
        { isDefault: false },
      );
    }

    // ✅ Vérifier que le pays existe si countryId est fourni
    if (updateDto.countryId) {
      const country = await this.countryRepo.findOne({
        where: { id: updateDto.countryId },
      });
      if (!country) {
        throw new NotFoundException(`Pays avec l'ID ${updateDto.countryId} non trouvé`);
      }
    }

    // ✅ Vérifier que la ville existe si cityId est fourni
    if (updateDto.cityId) {
      const city = await this.cityRepo.findOne({
        where: { id: updateDto.cityId },
      });
      if (!city) {
        throw new NotFoundException(`Ville avec l'ID ${updateDto.cityId} non trouvée`);
      }
    }

    Object.assign(address, updateDto);

    const updatedAddress = await this.addressUserRepo.save(address);

    // ✅ Recharger l'adresse avec les relations country et city
    const addressWithRelations = await this.addressUserRepo.findOne({
      where: { id: updatedAddress.id },
      relations: ['country', 'city'],
    });

    return addressWithRelations || updatedAddress;
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
      order: { createdAt: 'DESC' },
    });
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

  async findOne(id: string, user: UserEntity): Promise<AddressUser> {
    const address = await this.addressUserRepo.findOne({
      where: { id, user },
    });

    if (!address) {
      throw new NotFoundException(`Address with id ${id} not found`);
    }

    return address;
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
