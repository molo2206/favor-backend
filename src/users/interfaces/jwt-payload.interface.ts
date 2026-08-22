export interface JwtPayload {
    id: string;
    email: string;
    role: string | string[]; // à adapter selon ce que tu stockes réellement
    image: string,
    isActive: boolean,
    country: string,
    city: string,
    address: string,
    preferredLanguage: string,
    loyaltyPoints: number,
    dateOfBirth: string,
    vehicleType: string,
    plateNumber: string,
}
