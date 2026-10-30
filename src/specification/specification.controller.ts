import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { SpecificationService } from './specification.service';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('specifications')
export class SpecificationController {
  constructor(private readonly specService: SpecificationService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image')) // 'file' = nom du champ envoyé dans le form-data
  create(
    @Body() dto: CreateSpecificationDto,
    @UploadedFile() image?: Express.Multer.File, // fichier optionnel
  ) {
    return this.specService.create(dto, image);
  }

  // Mise à jour avec image optionnelle
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSpecificationDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.specService.update(id, dto, image);
  }

  @Get()
  findAll() {
    return this.specService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.specService.findOne(id);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.specService.remove(id);
  }

  @Get('category/:categoryId')
  findByCategory(@Param('categoryId') categoryId: string) {
    return this.specService.findByCategory(categoryId);
  }
}
