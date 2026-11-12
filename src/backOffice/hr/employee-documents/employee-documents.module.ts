// src/backOffice/hr/employee-documents/employee-documents.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeDocument } from './employee-document.entity';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDocumentsController } from './employee-documents.controller';

/** ✅ RH : dossiers des employés (CV, pièces d'identité, diplômes, contrats…) */
@Module({
  imports: [TypeOrmModule.forFeature([EmployeeDocument])],
  controllers: [EmployeeDocumentsController],
  providers: [EmployeeDocumentsService],
  exports: [EmployeeDocumentsService],
})
export class EmployeeDocumentsModule {}
