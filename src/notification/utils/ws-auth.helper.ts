// src/notification/utils/ws-auth.helper.ts
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

export interface WsUser {
    id: string;
    phone?: string;
    role?: string;
    fullName?: string;
}

@Injectable()
export class WsAuthHelper {
    private readonly logger = new Logger(WsAuthHelper.name);

    constructor(private readonly jwtService: JwtService) { }

    /**
     * Valide un JWT token et retourne l'utilisateur
     */
    async validateToken(token: string): Promise<WsUser | null> {
        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.ACCESS_TOKEN_SECRET_KEY,   // ✅ Utiliser votre vraie variable
            });

            return {
                id: payload.sub || payload.id || payload.userId,
                phone: payload.phone,
                role: payload.role,
                fullName: payload.fullName,
            };
        } catch (error: any) {
            this.logger.warn(`Token invalide: ${error.message}`);
            return null;
        }
    }

    /**
     * Extrait le token depuis les différents endroits possibles
     */
    extractToken(socket: any): string | null {
        // 1. Depuis auth (socket.handshake.auth.token)
        if (socket.handshake?.auth?.token) {
            return socket.handshake.auth.token;
        }

        // 2. Depuis les headers Authorization
        const authHeader = socket.handshake?.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // 3. Depuis query param
        if (socket.handshake?.query?.token) {
            return socket.handshake.query.token as string;
        }

        return null;
    }


}