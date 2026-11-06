// src/user-signatures/user-signatures.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory } from 'src/audit/enum/audit.enums';
import { UserSignaturesService } from './user-signatures.service';

const upload = FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * ✅ SIGNATURES DES UTILISATEURS
 *  GET    /user-signatures/me                ma signature
 *  PUT    /user-signatures/me                enregistrer / remplacer : multipart « file » (PNG, JPG, WEBP)
 *                                            ou JSON { image: "data:image/png;base64,…" } (signature dessinée)
 *  DELETE /user-signatures/me                supprimer ma signature
 *  GET    /user-signatures/users/:userId     signature d'un collègue (même entreprise) ou admin
 *  PUT    /user-signatures/users/:userId     Super Admin : enregistrer pour un utilisateur
 *  DELETE /user-signatures/users/:userId     Super Admin : supprimer
 */
@ApiTags('Signatures')
@ApiBearerAuth()
@Controller('user-signatures')
@UseGuards(AuthentificationGuard)
export class UserSignaturesController {
  constructor(private readonly service: UserSignaturesService) {}

  @Get('me')
  mine(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.service.mine(user, langFrom(req));
  }

  @Put('me')
  @UseInterceptors(upload)
  @AuditAction(ActionType.UPDATE, 'user_signatures', { category: AuditCategory.SECURITY })
  saveMine(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: Express.Multer.File,
    @Body('image') image?: string,
  ) {
    return this.service.save(user, user.id, file, image, langFrom(req));
  }

  @Delete('me')
  @AuditAction(ActionType.DELETE, 'user_signatures', { category: AuditCategory.SECURITY })
  removeMine(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.service.remove(user, user.id, langFrom(req));
  }

  @Get('users/:userId')
  ofUser(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.ofUser(user, userId, langFrom(req));
  }

  @Put('users/:userId')
  @UseInterceptors(upload)
  @AuditAction(ActionType.UPDATE, 'user_signatures', { category: AuditCategory.SECURITY })
  saveFor(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('userId', ParseUUIDPipe) userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('image') image?: string,
  ) {
    return this.service.save(user, userId, file, image, langFrom(req));
  }

  @Delete('users/:userId')
  @AuditAction(ActionType.DELETE, 'user_signatures', { category: AuditCategory.SECURITY })
  removeFor(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.remove(user, userId, langFrom(req));
  }
}
