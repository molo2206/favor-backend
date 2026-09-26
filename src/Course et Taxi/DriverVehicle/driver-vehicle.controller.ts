// driver-vehicle.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { DriverVehicleService } from './driver-vehicle.service';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateDriverVehicleByAdminDto } from './dto/create-driver-vehicle-byadmin.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('driver-vehicles')
export class DriverVehicleController {
  constructor(private readonly service: DriverVehicleService) {}

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  create(
    @Body() dto: CreateDriverVehicleDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
    @CurrentUser() user: UserEntity,
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };
    return this.service.create(dto, user, transformedFiles);
  }

  @Post('by/admin')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  createByadmin(@Body() dto: CreateDriverVehicleByAdminDto) {
    return this.service.createByadmin(dto);
  }

  // Tous les véhicules d’un chauffeur
  @Get('vehicles/bydriver')
  @UseGuards(AuthentificationGuard, RolesGuard)
  findByDriver(@CurrentUser() user: UserEntity) {
    return this.service.findAllByDriver(user.id);
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  async createByAdmin(
    @Body() dto: CreateDriverVehicleByAdminDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };

    return this.service.createByadmin(dto, transformedFiles);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverVehicleDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
    @CurrentUser() user: UserEntity,
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };
    return this.service.update(id, dto, user, transformedFiles);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
