import { Controller, Post, Patch, Body, Param, UseGuards, Get } from '@nestjs/common';
import { AddressUserService } from './address-user.service';
import { CreateAddressUserDto } from './dto/create-address-user.dto';
import { UpdateAddressUserDto } from './dto/update-address-user.dto';
import { UserEntity } from 'src/users/entities/user.entity'; // Adapter le chemin
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('addresses')
export class AddressUserController {
  constructor(private readonly addressUserService: AddressUserService) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async create(
    @Body() createDto: CreateAddressUserDto,
    @CurrentUser() user: UserEntity, 
  ) {
    const result = await this.addressUserService.create(createDto, user);
    return result;
  }

  @Patch('default/:addressId')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async updateDefaultAddress(
    @Param('addressId') addressId: string,
    @Body() updateDto: UpdateAddressUserDto,
    @CurrentUser() user: UserEntity, 
  ) {
    const updatedAddress = await this.addressUserService.updateDefaultAddress(
      user,
      addressId,
    );
    return { message: 'Adresse mise à jour avec succès', data: updatedAddress };
  }

  @Patch(':addressId')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async updateDefaultAddressWithData(
    @Param('addressId') addressId: string,
    @Body() updateDto: UpdateAddressUserDto,
    @CurrentUser() user: UserEntity, 
  ) {
    const updatedAddress = await this.addressUserService.updateDefaultAddressWithData(
      user,
      addressId,
      updateDto,
    );
    return { message: 'Adresse mise à jour avec succès', data: updatedAddress };
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(@CurrentUser() user: UserEntity) {
    const addresses = await this.addressUserService.findAll(user);
    return { data: addresses };
  }

  @Get(':addressId')
  @UseGuards(AuthentificationGuard)
  async findOne(
    @Param('addressId') addressId: string,
    @CurrentUser() user: UserEntity,
  ) {
    const address = await this.addressUserService.findOne(addressId, user);
    return { data: address };
  }
}
