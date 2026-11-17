import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TauxCompanyService } from './taux-company.service';
import { CreateTauxCompanyDto } from './dto/create-taux-company.dto';
import { UpdateTauxCompanyDto } from './dto/update-taux-company.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('taux-company')
export class TauxCompanyController {
  constructor(private readonly tauxCompanyService: TauxCompanyService) {}

  /** 🟢 Créer un nouveau taux */
  @Post()
  @UseGuards(AuthentificationGuard)
  create(@Body() createTauxCompanyDto: CreateTauxCompanyDto, @CurrentUser() user: UserEntity) {
    return this.tauxCompanyService.create(createTauxCompanyDto, user);
  }

  /** 🟡 Récupérer tous les taux */
  @Get()
  @UseGuards(AuthentificationGuard)
  findAll(@CurrentUser() user: UserEntity) {
    return this.tauxCompanyService.findAll(user);
  }

  /** 🔵 Récupérer un taux par ID */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tauxCompanyService.findOne(id); // ⚠️ plus de `+id`, car c’est un UUID
  }

  /** 🟠 Mettre à jour un taux */
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  update(@Param('id') id: string, @Body() updateTauxCompanyDto: UpdateTauxCompanyDto) {
    return this.tauxCompanyService.update(id, updateTauxCompanyDto);
  }

  /** 🔴 Supprimer un taux */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tauxCompanyService.remove(id);
  }
}
