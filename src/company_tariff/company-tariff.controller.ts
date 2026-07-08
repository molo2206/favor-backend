// src/company-tariff/company-tariff.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  Patch,
  Req,
  Query,
} from '@nestjs/common';
import { CompanyTariffService } from './company-tariff.service';
import { CreateCompanyTariffDto } from './dto/create-company-tariff.dto';
import { UpdateCompanyTariffDto } from './dto/update-company-tariff.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeGuard } from 'src/users/utility/guards/authorization.guard';
import { ServiceType } from './entities/company-tariff.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Request } from 'express';

@Controller('company-tariffs')
export class CompanyTariffController {
  constructor(private readonly tariffService: CompanyTariffService) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  async create(
    @Req() req: Request,
    @Body() dto: CreateCompanyTariffDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.tariffService['translate']('tariff.error.no_active_company', lang),
      );
    }
    const data = await this.tariffService.create(dto, user, lang);
    const message = await this.tariffService['translate']('tariff.create_success', lang);
    return { message, data };
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    const data = await this.tariffService.findOne(id, lang);
    const message = await this.tariffService['translate']('tariff.retrieve_success', lang);
    return { message, data };
  }

  @Get('company/:companyId')
  async getTariffsByCompany(
    @Req() req: Request,
    @Param('companyId') companyId: string,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.tariffService.getTariffsByCompanys(companyId, lang);
    const message = await this.tariffService['translate']('tariff.list_retrieved', lang);
    return { message, data };
  }

  @Get('company/:companyId/active')
  async getActiveTariffsByCompany(
    @Req() req: Request,
    @Param('companyId') companyId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const lang = this.extractLanguage(req);
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const data = await this.tariffService.getActiveTariffsByCompany(companyId, lang, pageNum, limitNum);
    const message = await this.tariffService['translate']('tariff.active_list_retrieved', lang);
    return { message, data };
  }

  @Get('company/:companyId/service/:serviceType')
  async getTariffByCompanyAndServiceType(
    @Req() req: Request,
    @Param('companyId') companyId: string,
    @Param('serviceType') serviceType: ServiceType,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.tariffService.getTariffByCompanyAndServiceType(
      companyId,
      serviceType,
      lang,
    );
    const message = await this.tariffService['translate']('tariff.retrieve_success', lang);
    return { message, data };
  }

  @Get('my-tariffs/get')
  async getMyTariffs(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.tariffService['translate']('tariff.error.no_active_company', lang),
      );
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const data = await this.tariffService.getTariffsByCompany(user.activeCompanyId, lang, pageNum, limitNum);
    const message = await this.tariffService['translate']('tariff.list_retrieved', lang);
    return { message, data };
  }

  @Get('my-tariffs/active')
  async getMyActiveTariffs(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.tariffService['translate']('tariff.error.no_active_company', lang),
      );
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const data = await this.tariffService.getActiveTariffsByCompany(user.activeCompanyId, lang, pageNum, limitNum);
    const message = await this.tariffService['translate']('tariff.active_list_retrieved', lang);
    return { message, data };
  }

  @Get('my-tariffs/best/:serviceType')
  async getMyBestTariff(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('serviceType') serviceType: ServiceType,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.tariffService['translate']('tariff.error.no_active_company', lang),
      );
    }
    const data = await this.tariffService.getTariffByCompanyAndServiceType(
      user.activeCompanyId,
      serviceType,
      lang,
    );
    const message = await this.tariffService['translate']('tariff.best_retrieved', lang);
    return { message, data };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyTariffDto,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.tariffService.update(id, dto, lang);
    const message = await this.tariffService['translate']('tariff.update_success', lang);
    return { message, data };
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    await this.tariffService.remove(id, lang);
    const message = await this.tariffService['translate']('tariff.delete_success', lang);
    return { message };
  }
}