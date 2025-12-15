import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ColisService } from './colis.service';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { CreateColisDto } from './dto/create-colis.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('colis')
export class ColisController {
  constructor(private readonly parcelService: ColisService) {}

  @UseGuards(AuthentificationGuard)
  @Post()
  async create(@Body() createParcelDto: CreateColisDto, @Req() req) {
    const clientId = req.user.id;
    return this.parcelService.createParcel(createParcelDto, clientId);
  }

  @UseGuards(AuthentificationGuard)
  @Patch(':id/set-price')
  async setPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() setParcelPriceDto: SetColisPriceDto,
  ) {
    return this.parcelService.setPrice(id, setParcelPriceDto);
  }
}
