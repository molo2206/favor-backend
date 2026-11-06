// src/users/sessions/user-sessions.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './user-session.entity';
import { UserSessionsService } from './user-sessions.service';
import { UserSessionsController } from './user-sessions.controller';

/** ✅ Sessions de connexion — module global (utilisé par UsersService et CurrentUserMiddleware) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserSession])],
  controllers: [UserSessionsController],
  providers: [UserSessionsService],
  exports: [UserSessionsService],
})
export class UserSessionsModule {}
