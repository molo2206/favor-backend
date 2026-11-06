// src/user-signatures/user-signatures.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSignature } from './user-signature.entity';
import { UserSignaturesService } from './user-signatures.service';
import { UserSignaturesController } from './user-signatures.controller';

/** ✅ Signatures des utilisateurs — module global (utilisé par les états de besoins) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserSignature])],
  controllers: [UserSignaturesController],
  providers: [UserSignaturesService],
  exports: [UserSignaturesService],
})
export class UserSignaturesModule {}
