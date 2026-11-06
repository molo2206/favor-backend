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
  Req,
} from '@nestjs/common';
import { MeasureService } from './measure.service';
import { CreateMeasureDto } from './dto/create-measure.dto';
import { UpdateMeasureDto } from './dto/update-measure.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CompanyPermissionsGuard } from 'src/users/utility/guards/company-permissions.guard';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { Request } from 'express';

@Controller('measures')
export class MeasureController {
  constructor(private readonly measureService: MeasureService) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es','ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard)
  async createMeasure(
    @Req() req: Request,
    @Body() dto: CreateMeasureDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.measureService.create(dto, user, lang);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.measureService['translate']('measure.error.no_active_company', lang),
      );
    }
    return await this.measureService.findAll(user.activeCompanyId, lang);
  }

  @Get('company/:id')
  async findAllByCompany(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const lang = this.extractLanguage(req);
    return await this.measureService.findAll(id, lang);
  }

  @Get('get/all')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'MEASURES', action: 'canRead' })
  async findAllMeseare(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.measureService.findAllMeseare(user, lang);
  }

  @Get(':id')
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const lang = this.extractLanguage(req);
    // Pour les utilisateurs non connectés ou sans entreprise active, on utilise findOnePublic
    return await this.measureService.findOnePublic(id, lang);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  async updateMeasure(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateMeasureDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.measureService.update(id, dto, user, lang);
  }

  @Delete(':id')
  async remove(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.measureService['translate']('measure.error.no_active_company', lang),
      );
    }
    return await this.measureService.remove(id, user.activeCompanyId, lang);
  }
}