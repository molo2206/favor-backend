import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeasureService } from './measure.service';
import { MeasureController } from './measure.controller';
import { MeasureEntity } from './entities/measure.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeasureEntity,
      CompanyEntity,
      UserHasCompanyEntity,
      CompanyHasUserResource,
    ]),
  ],
  controllers: [MeasureController],
  providers: [MeasureService, PermissionHelper],
})
export class MeasureModule {}
