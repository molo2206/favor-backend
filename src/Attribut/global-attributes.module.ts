import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { GlobalAttributeService } from './global_attributes.service';
import { GlobalAttributeController } from './global_attributes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GlobalAttribute, GlobalAttributeValue])],
  providers: [GlobalAttributeService],
  controllers: [GlobalAttributeController],
  exports: [GlobalAttributeService],
})
export class GlobalAttributesModule {}
