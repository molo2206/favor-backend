// auth/interfaces/authenticated-request.interface.ts
import { Request } from 'express';
import { UserEntity } from 'src/users/entities/user.entity';

export interface AuthenticatedRequest extends Request {
  currentUser?: UserEntity;
}
