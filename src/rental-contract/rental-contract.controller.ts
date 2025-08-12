import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RentalContractService } from './rental-contract.service';
import { CreateRentalContractDto } from './dto/create-rental-contract.dto';
import { UpdateRentalContractDto } from './dto/update-rental-contract.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { RentalStatus } from './enum/rentalStatus.enum';
import { UpdateRentalContractStatusDto } from './dto/UpdateRentalContractStatusDto';

@UseGuards(AuthentificationGuard, RolesGuard)
@Controller('rental-contracts')
export class RentalContractController {
  constructor(private readonly rentalContractService: RentalContractService) {}

  @Post()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @Body() createRentalContractDto: CreateRentalContractDto,
    @CurrentUser() user: UserEntity,
  ) {
    const contract = await this.rentalContractService.create(createRentalContractDto, user);
    return {
      message: 'Contrat de location créé avec succès',
      data: contract,
    };
  }

  @Get()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async findAll() {
    const data = await this.rentalContractService.findAll();
    return {
      message: 'Liste des contrats de location récupérée avec succès',
      data,
    };
  }

  @Get('me')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findByUser(@CurrentUser() user: UserEntity) {
    const data = await this.rentalContractService.findByUser(user);
    return {
      message: 'Contrats de location de l’utilisateur récupérés avec succès',
      data,
    };
  }

  @Get(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findOne(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    const data = await this.rentalContractService.findOne(id);
    return {
      message: `Contrat de location #${id} récupéré avec succès`,
      data,
    };
  }

  @Patch(':id/status')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateRentalContractStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    const updated = await this.rentalContractService.updateRentalContractStatus(
      id,
      updateStatusDto,
    );
    return {
      message: `Statut du contrat de location mis à jour avec succès`,
      data: updated.data,
    };
  }

  @Patch(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id') id: string,
    @Body() updateRentalContractDto: UpdateRentalContractDto,
    @CurrentUser() user: UserEntity,
  ) {
    const updated = await this.rentalContractService.update(id, updateRentalContractDto);
    return {
      message: `Contrat de location mis à jour avec succès`,
      data: updated,
    };
  }

  @Patch(':id/cancel')
  @AuthorizeRoles(['CUSTOMER'])
  async cancel(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    const cancelled = await this.rentalContractService.cancel(id, user);
    return {
      message: 'Contrat annulé avec succès',
      data: cancelled,
    };
  }

  @Delete(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    await this.rentalContractService.remove(id);
    return { message: 'Contrat supprimé avec succès' };
  }
}
