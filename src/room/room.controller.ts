import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ValidationPipe,
  UsePipes,
  UseInterceptors,
  UploadedFiles,
  ClassSerializerInterceptor,
  Query,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Room } from './entities/room.entity';
import { FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @UseInterceptors(ClassSerializerInterceptor)
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @UseInterceptors(FilesInterceptor('images', 5))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateRoomDto,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string; data: Room }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vous devez fournir au moins une image');
    }

    if (files.length < 1 || files.length > 5) {
      throw new BadRequestException("Le nombre d'images doit être compris entre 1 et 5");
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    return this.roomService.create(dto, files, user);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(AnyFilesInterceptor())
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.roomService.update(id, dto, user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ message: string; data: Room }> {
    return this.roomService.findOne(id);
  }

  @Get('by-company/id')
  async findAll(
    @Query('companyId') companyId?: string,
  ): Promise<{ message: string; data: Room[] }> {
    return this.roomService.findAll(companyId);
  }
  @Get()
  async findAvailableRooms(
    @Query('address') address: string,
    @Query('checkInDate') checkInDate: string,
    @Query('checkOutDate') checkOutDate: string,
  ): Promise<{ message: string; data: Room[] }> {
    if (!address || !checkInDate || !checkOutDate) {
      throw new BadRequestException(
        'Les paramètres address, checkInDate et checkOutDate sont requis',
      );
    }
    const rooms = await this.roomService.findAvailableRooms(address, checkInDate, checkOutDate);

    return {
      message: 'Chambres disponibles récupérées avec succès',
      data: rooms,
    };
  }
}
