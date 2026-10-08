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
     * ✅ Extrait le token depuis :
     *   1. headers.authorization  (Bearer)
     *   2. query.token
     *   3. auth.token (Socket.IO natif)
     */
    extractToken(socket: any): string | null {
        // 1️⃣ Priorité : header Authorization Bearer
        const authHeader = socket.handshake?.headers?.authorization;
        if (authHeader && typeof authHeader === 'string') {
            const cleaned = this.cleanToken(authHeader);
            if (cleaned) {
                this.logger.log('✅ Token trouvé dans headers.authorization');
                return cleaned;
            }
        }

        // 2️⃣ Fallback : query.token
        const queryToken = socket.handshake?.query?.token;
        if (queryToken) {
            const raw = Array.isArray(queryToken) ? queryToken[0] : queryToken;
            if (typeof raw === 'string') {
                const cleaned = this.cleanToken(raw);
                if (cleaned) {
                    this.logger.log('✅ Token trouvé dans query.token');
                    return cleaned;
                }
            }
        }

        // 3️⃣ Fallback : auth.token (Socket.IO natif)
        const authToken = socket.handshake?.auth?.token;
        if (authToken && typeof authToken === 'string') {
            const cleaned = this.cleanToken(authToken);
            if (cleaned) {
                this.logger.log('✅ Token trouvé dans auth.token');
                return cleaned;
            }
        }

        this.logger.warn('❌ Aucun token trouvé');
        return null;
    }

    /**
     * 🧹 Nettoie le token : retire "Bearer " et vérifie le format JWT
     */
    private cleanToken(raw: string): string | null {
        let token = raw.trim();

        if (token.toLowerCase().startsWith('bearer ')) {
            token = token.substring(7).trim();
        }

        if (token.split('.').length !== 3) {
            this.logger.warn(`Token malformé (pas 3 parties)`);
            return null;
        }

        return token;
    }

    // ============================================================
    // ✅ NOUVEAU : helpers "livreur"
    // ============================================================

    /**
     * Vérifie si un rôle correspond à un livreur
     */
    isDeliverRole(role?: string | null): boolean {
        if (!role) return false;
        const r = String(role).toUpperCase().replace(/\s+/g, '_');
        return r === 'DELIVER' || r === 'DELIVERY' || r === 'LIVREUR';
    }

    /**
     * Extrait le deliverId depuis un socket identifié.
     * Retourne null si :
     *   - socket non identifié (pas de client.data.userId)
     *   - rôle ≠ livreur
     */
    extractDeliverId(socket: any): string | null {
        const userId = socket?.data?.userId;
        const role = socket?.data?.role;
        if (!userId) return null;
        return this.isDeliverRole(role) ? userId : null;
    }

    /**
     * Extrait l'userId depuis un socket identifié (peu importe le rôle)
     */
    extractUserId(socket: any): string | null {
        return socket?.data?.userId || null;
    }
}