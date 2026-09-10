// image.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImagesController } from './images.controller';
import { ImageService } from './image.service';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(null, true);
        } else {
          cb(new Error('Format non supporté. Utilisez JPG, PNG, GIF ou WEBP.'), false);
        }
      },
    }),
    CloudinaryModule,
  ],
  controllers: [ImagesController],
  providers: [ImageService, CloudinaryService],
  exports: [ImageService, MulterModule],
})
export class ImageModule {}