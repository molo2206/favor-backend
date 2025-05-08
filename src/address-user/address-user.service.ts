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
    if (createDto.isDefault) {
      // Désactiver les anciennes adresses par défaut
      await this.addressUserRepo.update(
        { user: { id: user.id }, isDefault: true },
        { isDefault: false },
      );
    }

    // Créer et sauvegarder la nouvelle adresse
    const savedAddress = this.addressUserRepo.create({
      ...createDto,
      user, // ou: user: { id: user.id },
      latitude: Number(createDto.latitude),
      longitude: Number(createDto.longitude),
    });
    

    // Si l'adresse est par défaut, mettre à jour le user
    if (createDto.isDefault) {
      await this.userRepo.update(user.id, {
        defaultAddress: savedAddress,
        defaultAddressId: savedAddress.id,
      });
    }

    return {
      message: 'Adresse créée avec succès',
      data: savedAddress,
    };
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
      where: { user },
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

    // Si l'utilisateur veut que cette adresse devienne la nouvelle par défaut
    if (updateDto.isDefault) {
      await this.addressUserRepo.update(
        { user: { id: user.id }, isDefault: true },
        { isDefault: false },
      );
      address.isDefault = true;
      user.defaultAddress = address;
      user.defaultAddressId = address.id;
      await this.userRepo.save(user);
    }

    // Mise à jour des champs de l'adresse
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

  async update(id: string, updateDto: UpdateAddressUserDto, user: UserEntity): Promise<AddressUser> {
    const address = await this.findOne(id, user);

    if (updateDto.isDefault) {
      // Désactiver les autres adresses par défaut avant de mettre à jour
      await this.addressUserRepo.update(
        { user, isDefault: true },
        { isDefault: false },
      );
    }

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
