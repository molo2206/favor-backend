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
  findAll() {
    return this.rentalContractService.findAll();
  }

  @Get('me')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  findByUser(@CurrentUser() user: UserEntity) {
    return this.rentalContractService.findByUser(user);
  }

  @Get(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  findOne(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.rentalContractService.findOne(id);
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
    return updated;
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
