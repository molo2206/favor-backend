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
     * ✅ Extrait le token depuis :
     *   1. socket.handshake.auth.token       ← Mobile app (Socket.IO natif)
     *   2. socket.handshake.headers.authorization (Bearer) ← Hoppscotch/curl
     */
    extractToken(socket: any): string | null {
        // 1️⃣ PRIORITÉ : auth.token (Socket.IO natif — utilisé par mobile app)
        const authToken = socket.handshake?.auth?.token;
        if (authToken && typeof authToken === 'string') {
            const cleaned = this.cleanToken(authToken);
            if (cleaned) {
                this.logger.log('✅ Token trouvé dans handshake.auth.token');
                return cleaned;
            }
        }

        // 2️⃣ PRIORITÉ : header Authorization Bearer (Hoppscotch, curl)
        const authHeader = socket.handshake?.headers?.authorization;
        if (authHeader && typeof authHeader === 'string') {
            const cleaned = this.cleanToken(authHeader);
            if (cleaned) {
                this.logger.log('✅ Token trouvé dans headers.authorization');
                return cleaned;
            }
        }

        this.logger.warn('❌ Aucun token trouvé (ni auth.token, ni headers.authorization)');
        return null;
    }

    /**
     * 🧹 Nettoie le token : retire "Bearer " et vérifie le format JWT
     */
    private cleanToken(raw: string): string | null {
        let token = raw.trim();

        // Retirer "Bearer " si présent (insensible à la casse)
        if (token.toLowerCase().startsWith('bearer ')) {
            token = token.substring(7).trim();
        }

        // Vérifier que c'est un JWT valide (3 parties)
        if (token.split('.').length !== 3) {
            this.logger.warn(`Token malformé (pas 3 parties)`);
            return null;
        }

        return token;
    }
}