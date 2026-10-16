import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ColisService } from './colis.service';
import { CreateColisDto } from './dto/create-colis.dto';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ParseUUIDPipe } from '@nestjs/common';
import { ColisTrackingStatus } from './entity/colis-tracking.entity';
import { CreateColisTrackingDto } from './dto/eate-colis-tracking.dto';

@Controller('colis')
@UseInterceptors(ClassSerializerInterceptor)
export class ColisController {
  constructor(private readonly colisService: ColisService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  async createColis(@Body() createColisDto: CreateColisDto, @CurrentUser() user: UserEntity) {
    return await this.colisService.createColis(createColisDto, user);
  }

  @Patch(':id/assign-deliver')
  @UseGuards(AuthentificationGuard)
  async assignDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignCourierDto: AssignCourierDto,
  ) {
    return await this.colisService.assignDriver(id, assignCourierDto);
  }

  @Patch(':id/set-price')
  @UseGuards(AuthentificationGuard)
  async setPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() setColisPriceDto: SetColisPriceDto,
  ) {
    return await this.colisService.setPrice(id, setColisPriceDto);
  }

  @Get(':id')
  async getColisById(@Param('id', ParseUUIDPipe) id: string) {
    return await this.colisService.getColisById(id);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async getAllColis() {
    return await this.colisService.getAllColis();
  }

  @Get('track/:trackingNumber')
  async trackColis(@Param('trackingNumber') trackingNumber: string) {
    const colis = await this.colisService.trackColis(trackingNumber);
    return {
      message: 'Colis retrouvé avec succès',
      colis,
    };
  }

  @Post(':id/tracking')
  async addTracking(
    @Param('id') colisId: string,
    @Body() dto: CreateColisTrackingDto,
    @CurrentUser() user: UserEntity,
  ) {
    const tracking = await this.colisService.addTracking(
      colisId,
      dto.status,
      user?.id,
      dto.location,
      dto.note,
    );

    return { message: 'Statut ajouté', tracking };
  }

  @Get(':id/tracking')
  async getTracking(@Param('id') colisId: string) {
    const history = await this.colisService.getTrackingHistory(colisId);
    return { message: 'Historique du colis', history };
  }
}
