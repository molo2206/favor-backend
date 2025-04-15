export interface JwtPayload {
    id: string;
    email: string;
    role: string | string[]; // à adapter selon ce que tu stockes réellement
}
