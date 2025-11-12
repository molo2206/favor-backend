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
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@UseGuards(AuthentificationGuard, RolesGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(@Body() createBookingDto: CreateBookingDto, @CurrentUser() user: UserEntity) {
    const booking = await this.bookingService.create(createBookingDto, user);
    return {
      message: 'Réservation créée avec succès',
      data: booking,
    };
  }

  @Get()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async findAll() {
    const { message, data } = await this.bookingService.findAll();

    // Supprimer le mot de passe de tous les utilisateurs
    const sanitized = data.map((booking) => {
      if (booking.user) {
        delete (booking.user as any).password;
      }
      return booking;
    });

    return {
      message,
      data: sanitized,
    };
  }

  @Get('me/my-bookings')
  @AuthorizeRoles(['CUSTOMER'])
  async findByUser(@CurrentUser() user: UserEntity) {
    const { message, data } = await this.bookingService.findByUser(user);

    // Supprimer le mot de passe de tous les utilisateurs
    const sanitized = data.map((booking) => {
      if (booking.user) {
        delete (booking.user as any).password;
      }
      return booking;
    });

    return {
      message: 'Réservations de l’utilisateur récupérées avec succès',
      data: sanitized,
    };
  }

  @Get(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findOne(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    const { message, data } = await this.bookingService.findOne(id);

    // Supprimer le mot de passe si présent
    if (data.user) {
      delete (data.user as any).password;
    }

    return {
      message: `Réservation #${id} récupérée avec succès`,
      data,
    };
  }

  @Patch(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id') id: string,
    @Body() updateBookingDto: UpdateBookingDto,
    @CurrentUser() user: UserEntity,
  ) {
    const updated = await this.bookingService.update(id, updateBookingDto);
    return {
      message: `Réservation mise à jour avec succès`,
      data: updated,
    };
  }

  @Patch(':id/cancel')
  @AuthorizeRoles(['CUSTOMER'])
  async cancel(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    const cancelled = await this.bookingService.cancel(id, user);
    return {
      message: 'Réservation annulée avec succès',
      data: cancelled,
    };
  }

  @Delete(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    await this.bookingService.remove(id);
    return { message: 'Réservation supprimée avec succès' };
  }
}
