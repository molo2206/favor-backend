import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Param,
  Delete,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload/:folder/single')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './temp',
        filename: (req, file, cb) => {
          const name = Date.now() + '-' + file.originalname;
          cb(null, name);
        },
      }),
      limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB
      },
    }),
  )
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
  ) {
    const result = await this.filesService.uploadFile(file, folder);

    return {
      message: 'Fichier uploadé',
      data: result.data,
    };
  }

  @Post('upload/:folder/multiple')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: './temp',
        filename: (req, file, cb) => {
          const name = Date.now() + '-' + file.originalname;
          cb(null, name);
        },
      }),
    }),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('folder') folder: string,
  ) {
    const results = await this.filesService.uploadFiles(files, folder);

    return {
      message: `${results.length} fichier(s) uploadé(s)`,
      data: results.map((r) => r.data),
    };
  }

  @Delete(':folder/:filename')
  async deleteFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
  ) {
    return this.filesService.deleteFile(folder, filename);
  }
}