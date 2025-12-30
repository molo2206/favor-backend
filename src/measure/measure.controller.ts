import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { MeasureService } from './measure.service';
import { CreateMeasureDto } from './dto/create-measure.dto';
import { UpdateMeasureDto } from './dto/update-measure.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('measures')
export class MeasureController {
  constructor(private readonly measureService: MeasureService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  async createMeasure(@Body() dto: CreateMeasureDto, @CurrentUser() user: UserEntity) {
    return this.measureService.create(dto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active n’est associée à cet utilisateur',
      );
    }

    console.log('✅ Entreprise active utilisée :', user.activeCompanyId);

    return await this.measureService.findAll(user.activeCompanyId);
  }

  @Get('company/:id')
  async findAllByCompany(@Param('id') id: string) {
    return await this.measureService.findAll(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active n’est associée à cet utilisateur',
      );
    }

    return await this.measureService.findOne(id, user.activeCompanyId);
  }
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  async updateMeasure(
    @Param('id') id: string,
    @Body() dto: UpdateMeasureDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.measureService.update(id, dto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active n’est associée à cet utilisateur',
      );
    }
    return await this.measureService.remove(id, user.activeCompanyId);
  }
}
