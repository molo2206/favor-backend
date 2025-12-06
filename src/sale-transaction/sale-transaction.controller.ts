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
  ForbiddenException,
} from '@nestjs/common';
import { SaleTransactionService } from './sale-transaction.service';
import { CreateSaleTransactionDto } from './dto/create-sale-transaction.dto';
import { UpdateSaleTransactionDto } from './dto/update-sale-transaction.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UpdateSaleStatusDto } from './dto/UpdateSaleStatusDto';

@UseGuards(AuthentificationGuard, RolesGuard)
@Controller('sale-transactions')
export class SaleTransactionController {
  constructor(private readonly saleTransactionService: SaleTransactionService) {}

  @Post()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @Body() createSaleTransactionDto: CreateSaleTransactionDto,
    @CurrentUser() user: UserEntity,
  ) {
    const transaction = await this.saleTransactionService.create(
      createSaleTransactionDto,
      user.id,
    );
    return {
      message: 'Transaction de vente créée avec succès',
      data: transaction,
    };
  }

  @Patch(':id/status')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateSaleStatusDto) {
    const updated = await this.saleTransactionService.updateSaleTransactionStatus(
      id,
      updateStatusDto,
    );
    return {
      message: `Statut de la transaction mis à jour avec succès`,
      data: updated.data,
    };
  }

  @Get()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async findAll() {
    const data = await this.saleTransactionService.findAll();
    return {
      message: 'Liste des transactions récupérée avec succès',
      data,
    };
  }

  @Get('me')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findByUser(@CurrentUser() user: UserEntity) {
    const data = await this.saleTransactionService.findByUser(user);
    return {
      message: 'Vos transactions ont été récupérées avec succès',
      data,
    };
  }

  @Get(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findOne(@Param('id') id: string) {
    const data = await this.saleTransactionService.findOne(id);
    return {
      message: `Transaction #${id} récupérée avec succès`,
      data,
    };
  }

  @Patch(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id') id: string,
    @Body() updateSaleTransactionDto: UpdateSaleTransactionDto,
  ) {
    const updated = await this.saleTransactionService.update(id, updateSaleTransactionDto);
    return {
      message: 'Transaction mise à jour avec succès',
      data: updated,
    };
  }

  @Delete(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    await this.saleTransactionService.remove(id);
    return { message: `Transaction #${id} supprimée avec succès` };
  }
}
