import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { TypeTransportService } from './type-transport.service';
import { CreateTypeTransportDto } from './dto/create-type-transport.dto';
import { UpdateTypeTransportDto } from './dto/update-type-transport.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('type-transports')
@UsePipes(new ValidationPipe({ transform: true }))
export class TypeTransportController {
  constructor(private readonly typeTransportService: TypeTransportService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() body: CreateTypeTransportDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.typeTransportService.create(body, file);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  findAll() {
    return this.typeTransportService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeTransportService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeTransportDto: UpdateTypeTransportDto) {
    return this.typeTransportService.update(id, updateTypeTransportDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeTransportService.remove(id);
  }
}
