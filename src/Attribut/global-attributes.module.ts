import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { GlobalAttributeService } from './global_attributes.service';
import { GlobalAttributeController } from './global_attributes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalAttribute,
      GlobalAttributeValue,
      Specification, // permet de vérifier et lier les spécifications
    ]),
  ],
  providers: [GlobalAttributeService],
  controllers: [GlobalAttributeController],
  exports: [GlobalAttributeService], // permet de l'utiliser dans d'autres modules si besoin
})
export class GlobalAttributesModule {}
