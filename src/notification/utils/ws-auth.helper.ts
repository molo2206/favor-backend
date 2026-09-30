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
     * ✅ Valide un JWT token et retourne l'utilisateur
     */
    async validateToken(token: string): Promise<WsUser | null> {
        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.ACCESS_TOKEN_SECRET_KEY,
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
     * ✅ Extrait le token UNIQUEMENT depuis le header Authorization
     * Format attendu : "Authorization: Bearer <token>"
     */
    extractToken(socket: any): string | null {
        const authHeader = socket.handshake?.headers?.authorization;

        // ⚠️ Doit commencer par "Bearer " (insensible à la casse)
        if (!authHeader || typeof authHeader !== 'string') {
            this.logger.warn('Aucun header Authorization trouvé');
            return null;
        }

        if (!authHeader.toLowerCase().startsWith('bearer ')) {
            this.logger.warn(`Header Authorization ne commence pas par "Bearer "`);
            return null;
        }

        // Retirer "Bearer " et trim
        const token = authHeader.substring(7).trim();

        // Vérifier que c'est un JWT valide (3 parties)
        if (token.split('.').length !== 3) {
            this.logger.warn(`Token malformé (pas 3 parties)`);
            return null;
        }

        return token;
    }
}