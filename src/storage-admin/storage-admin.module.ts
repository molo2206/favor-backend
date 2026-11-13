// src/storage-admin/storage-admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileTrash } from './file-trash.entity';
import { FileReferencesService } from './file-references.service';
import { FileManagerService } from './file-manager.service';
import { RejectedCleanupService } from './rejected-cleanup.service';
import { StorageAdminController } from './storage-admin.controller';

/** ✅ Gestionnaire de fichiers du serveur, corbeille, fichiers orphelins, purge des produits / entreprises rejetés */
@Module({
  imports: [TypeOrmModule.forFeature([FileTrash])],
  providers: [FileReferencesService, FileManagerService, RejectedCleanupService],
  controllers: [StorageAdminController],
  exports: [FileReferencesService, FileManagerService, RejectedCleanupService],
})
export class StorageAdminModule {}
