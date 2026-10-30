import { Module } from '@nestjs/common';
import { CompanyHasResourceService } from './company_has_resource.service';
import { CompanyHasResourceController } from './company_has_resource.controller';

@Module({
  controllers: [CompanyHasResourceController],
  providers: [CompanyHasResourceService],
})
export class CompanyHasResourceModule {}
