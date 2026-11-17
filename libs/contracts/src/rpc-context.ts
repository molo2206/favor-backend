/** Utilisateur connecté transmis par l'api-gateway (JWT déjà vérifié) */
export interface RpcUser {
  id: string;
  role?: string | null;
}

/** Enveloppe de chaque message envoyé à un microservice */
export interface RpcEnvelope<T = any> {
  user?: RpcUser | null;
  lang: string;
  platform?: string | null;
  requestId?: string;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: T;
}

/** Erreur renvoyée par un microservice (convertie en réponse HTTP par la gateway) */
export interface RpcErrorPayload {
  status: number;
  response: string | Record<string, any>;
}
