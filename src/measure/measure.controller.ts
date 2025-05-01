import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { MeasureService } from './measure.service';
import { CreateMeasureDto } from './dto/create-measure.dto';
import { UpdateMeasureDto } from './dto/update-measure.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('measures')
export class MeasureController {
  constructor(private readonly measureService: MeasureService) { }

  @Post()
  async create(
    @Body() createMeasureDto: CreateMeasureDto,
    @CurrentUser() user: UserEntity,
  ) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active n’est associée à cet utilisateur');
    }

    return await this.measureService.create(createMeasureDto, user.activeCompanyId);
  }


  @Get()
  async findAll(@CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active n’est associée à cet utilisateur');
    }
    return await this.measureService.findAll(user.activeCompanyId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active n’est associée à cet utilisateur');
    }

    return await this.measureService.findOne(id, user.activeCompanyId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMeasureDto: UpdateMeasureDto,
    @CurrentUser() user: UserEntity,
  ) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active n’est associée à cet utilisateur');
    }
    return await this.measureService.update(id, updateMeasureDto, user.activeCompanyId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active n’est associée à cet utilisateur');
    }
    return await this.measureService.remove(id, user.activeCompanyId);
  }
}
