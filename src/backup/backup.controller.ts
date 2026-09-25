// src/backup/backup.controller.ts
import { Controller, Get, Post, Param, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('create')
  async createBackup(@Res() res: Response) {
    try {
      const result = await this.backupService.createBackup();
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: result
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  }

  @Post('restore/:filename')
  async restoreBackup(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const result = await this.backupService.restoreBackup(filename);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: result
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  }

  @Get('list')
  async listBackups(@Res() res: Response) {
    try {
      const backups = this.backupService.listBackups();
      return res.status(HttpStatus.OK).json({
        success: true,
        backups: backups
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  }

  @Get('download/:filename')
  async downloadBackup(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const backupPath = require('path').join(__dirname, '..', '..', 'backups', filename);
      
      if (!require('fs').existsSync(backupPath)) {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: 'Fichier de backup non trouvé'
        });
      }

      return res.download(backupPath, filename);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  }
}