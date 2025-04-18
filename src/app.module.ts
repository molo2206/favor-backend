import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CurrentUserMiddleware } from './users/utility/middlewares/current-user.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from 'db/data-source';
import { UsersModule } from './users/users.module';
import { OtpModule } from './otp/otp.module';
import { CompanyModule } from './company/company.module';
import { UserHasCompanyModule } from './user_has_company/user_has_company.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UserHasCompanyPermissionsModule } from './user_has_company_permissions/user_has_company_permissions.module';
import { TypeCompanyModule } from './type_company/type_company.module';
import { RoleUserModule } from './role_user/role_user.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './products/products.module'; // 👈 importe le module
import { OrderModule } from './order/order.module';
import { SubOrdersModule } from './sub_orders/sub_orders.module';
import { OrderItemsModule } from './order_items/order_items.module';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from './users/utility/helpers/cloudinary.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    UsersModule,
    OtpModule,
    CompanyModule,
    UserHasCompanyModule,
    PermissionsModule,
    UserHasCompanyPermissionsModule,
    TypeCompanyModule,
    RoleUserModule,
    CategoryModule,
    ProductModule,
    OrderModule,
    SubOrdersModule,
    OrderItemsModule,
    CloudinaryModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CurrentUserMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}