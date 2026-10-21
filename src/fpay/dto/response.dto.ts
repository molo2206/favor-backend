// src/modules/fpay/dto/response.dto.ts
export class FpayResponse<T> {
    message: string;
    data: T;
}

export class WalletDto {
    id: string;
    userId: string;
    balance: number;
    currency: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export class TransactionDto {
    id: string;
    userId: string;
    walletId: string;
    amount: number;
    currency: string;
    type: string;
    status: string;
    reference: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    movement: 'DEBIT' | 'CREDIT';
    external_reference: string | null;
    paymentMethod: string;
}

export class PaymentResponseDto {
    wallet: WalletDto;
    transaction: TransactionDto;
}

export class AuthSuccessResponse {
    id: string;
    email: string | null;
    phone: string;
    full_name: string;
    role: string;
    status: string;
    profileImage: string;
    kycStatus: string;
    countryCode: string;
}