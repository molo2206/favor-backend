// src/backOffice/hr/signatures/employee-signatures.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSignature } from './employee-signature.entity';
import { EmployeeSignaturesService } from './employee-signatures.service';
import { EmployeeSignaturesController } from './employee-signatures.controller';

/** ✅ Signatures des employés — module global (utilisé par les états de besoins) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmployeeSignature])],
  controllers: [EmployeeSignaturesController],
  providers: [EmployeeSignaturesService],
  exports: [EmployeeSignaturesService],
})
export class EmployeeSignaturesModule {}
