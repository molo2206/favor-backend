// exchange-rate.service.ts
import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios'; // ✅ Ajout
import { Country } from 'src/company/entities/country.entity';
import * as os from 'os';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';

const countryCurrencyMap: Record<string, {
    countryId: string;
    countryCode: string;
    countryName: string;
    currencies: string[];
    defaultCurrency: string;
}> = {
    '335d0a51-bbfc-4154-a4a8-d16e617d1cbb': {
        countryId: '335d0a51-bbfc-4154-a4a8-d16e617d1cbb',
        countryCode: 'AE',
        countryName: 'United Arab Emirates',
        currencies: ['USD', 'AED'],
        defaultCurrency: 'AED'
    },
    '7c014a21-a990-45d8-b1eb-d7e39af32b3b': {
        countryId: '7c014a21-a990-45d8-b1eb-d7e39af32b3b',
        countryCode: 'CD',
        countryName: 'Congo, The Democratic Republic of the Congo',
        currencies: ['USD', 'CDF'],
        defaultCurrency: 'CDF'
    },
    '65a607df-4a32-451d-8eb0-3247dfc46052': {
        countryId: '65a607df-4a32-451d-8eb0-3247dfc46052',
        countryCode: 'BE',
        countryName: 'Benin',
        currencies: ['USD', 'XOF'],
        defaultCurrency: 'XOF'
    },
    '0ef48b5c-7308-49d9-850a-0dbbfe109e01': {
        countryId: '0ef48b5c-7308-49d9-850a-0dbbfe109e01',
        countryCode: 'UG',
        countryName: 'Uganda',
        currencies: ['USD', 'UGX'],
        defaultCurrency: 'UGX'
    },
    'b18a4df0-ea5c-4328-93a6-6072874b43e5': {
        countryId: 'b18a4df0-ea5c-4328-93a6-6072874b43e5',
        countryCode: 'BI',
        countryName: 'Burundi',
        currencies: ['USD', 'BIF'],
        defaultCurrency: 'BIF'
    }
};
@Injectable()
export class ExchangeRateService {
    private readonly logger = new Logger(ExchangeRateService.name);

    constructor(
        @InjectRepository(ExchangeRateEntity)
        private readonly exchangeRateRepo: Repository<ExchangeRateEntity>,
        @InjectRepository(Country) // ✅ Ajout
        private readonly countryRepository: Repository<Country>, // ✅ Ajout
        private readonly httpService: HttpService, // ✅ Ajout
        @InjectRepository(UserSettingsEntity)
        private readonly userSettingsRepo: Repository<UserSettingsEntity>,
    ) { }

    /**
     * Créer un taux de change
     */
    async create(dto: CreateExchangeRateDto) {
        // ✅ Vérifier si la devise existe déjà
        const existing = await this.exchangeRateRepo.findOne({
            where: {
                currency: dto.currency.toUpperCase(),
                deleted: false,
            },
        });

        if (existing) {
            throw new BadRequestException(
                `Un taux de change existe déjà pour la devise ${dto.currency}`
            );
        }

        const rate = this.exchangeRateRepo.create({
            currency: dto.currency.toUpperCase(),
            value: dto.value,
            status: dto.status ?? true,
            deleted: false,
        });

        const saved = await this.exchangeRateRepo.save(rate);

        this.logger.log(`✅ Taux de change créé: ${saved.currency} = ${saved.value}`);

        return {
            message: 'Taux de change créé avec succès',
            data: saved,
        };
    }

    /**
     * Récupérer tous les taux de change
     */
    async findAll() {
        const rates = await this.exchangeRateRepo.find({
            where: { deleted: false },
            order: { currency: 'ASC' },
        });

        return {
            message: 'Liste des taux de change récupérée avec succès',
            data: rates,
        };
    }

    /**
     * Récupérer les taux actifs
     */
    async findActive() {
        const rates = await this.exchangeRateRepo.find({
            where: { deleted: false, status: true },
            order: { currency: 'ASC' },
        });

        return {
            message: 'Liste des taux de change actifs récupérée avec succès',
            data: rates,
        };
    }

    /**
     * Récupérer un taux de change par ID
     */
    async findOne(id: string) {
        const rate = await this.exchangeRateRepo.findOne({
            where: { id, deleted: false },
        });

        if (!rate) {
            throw new NotFoundException(
                `Taux de change avec l'ID ${id} non trouvé`
            );
        }

        return {
            message: 'Taux de change récupéré avec succès',
            data: rate,
        };
    }

    /**
     * Récupérer un taux de change par devise
     */
    async findByCurrency(currency: string) {
        const rate = await this.exchangeRateRepo.findOne({
            where: {
                currency: currency.toUpperCase(),
                deleted: false,
                status: true,
            },
        });

        if (!rate) {
            throw new NotFoundException(
                `Taux de change pour la devise ${currency} non trouvé`
            );
        }

        return {
            message: 'Taux de change récupéré avec succès',
            data: rate,
        };
    }

    /**
     * Mettre à jour un taux de change
     */
    async update(id: string, dto: UpdateExchangeRateDto) {
        const rate = await this.exchangeRateRepo.findOne({
            where: { id, deleted: false },
        });

        if (!rate) {
            throw new NotFoundException(
                `Taux de change avec l'ID ${id} non trouvé`
            );
        }

        // ✅ Vérifier les doublons si la devise change
        if (dto.currency) {
            const existing = await this.exchangeRateRepo.findOne({
                where: {
                    currency: dto.currency.toUpperCase(),
                    deleted: false,
                },
            });

            if (existing && existing.id !== id) {
                throw new BadRequestException(
                    `Un taux de change existe déjà pour la devise ${dto.currency}`
                );
            }
        }

        // ✅ Mettre à jour
        if (dto.currency) rate.currency = dto.currency.toUpperCase();
        if (dto.value !== undefined) rate.value = dto.value;
        if (dto.status !== undefined) rate.status = dto.status;
        if (dto.deleted !== undefined) rate.deleted = dto.deleted;

        const updated = await this.exchangeRateRepo.save(rate);

        this.logger.log(`✅ Taux de change mis à jour: ${updated.currency} = ${updated.value}`);

        return {
            message: 'Taux de change mis à jour avec succès',
            data: updated,
        };
    }

    /**
     * Supprimer un taux de change (soft delete)
     */
    async delete(id: string) {
        const rate = await this.exchangeRateRepo.findOne({
            where: { id, deleted: false },
        });

        if (!rate) {
            throw new NotFoundException(
                `Taux de change avec l'ID ${id} non trouvé`
            );
        }

        rate.deleted = true;
        await this.exchangeRateRepo.save(rate);

        this.logger.log(`🗑️ Taux de change supprimé: ${rate.currency}`);

        return {
            message: 'Taux de change supprimé avec succès',
            data: null,
        };
    }

    /**
     * Supprimer définitivement un taux de change (hard delete)
     */
    async hardDelete(id: string) {
        const rate = await this.exchangeRateRepo.findOne({
            where: { id },
        });

        if (!rate) {
            throw new NotFoundException(
                `Taux de change avec l'ID ${id} non trouvé`
            );
        }

        await this.exchangeRateRepo.remove(rate);

        this.logger.log(`🗑️ Taux de change supprimé définitivement: ${rate.currency}`);

        return {
            message: 'Taux de change supprimé définitivement',
            data: null,
        };
    }

    async getServerPublicIp(): Promise<string> {
        try {
            const response = await firstValueFrom(
                this.httpService.get('https://api.ipify.org?format=json', {
                    timeout: 5000,
                }),
            );
            return response.data.ip;
        } catch (error) {
            console.error('❌ Erreur récupération IP publique:', error);
            return '127.0.0.1';
        }
    }

    /**
     * Récupérer l'IP locale du serveur
     */
    getServerLocalIp(): string {
        const networkInterfaces = os.networkInterfaces();
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            if (interfaces) {
                for (const iface of interfaces) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        return iface.address;
                    }
                }
            }
        }
        return '127.0.0.1';
    }

    async getCurrencyByIp(
        ip: string,
        countryId?: string,
        userId?: string  // ✅ Ajout du userId pour récupérer la devise de l'utilisateur
    ): Promise<{
        message: string;
        data: {
            defaultCurrency: string;
            currencies: {
                currency: string;
                value: number;
                status: boolean;
            }[];
            countryCode?: string;
            countryName?: string;
            ip?: string;
            serverInfo?: {
                publicIp?: string;
                localIp?: string;
            };
        }
    }> {
        try {
            let countryCode: string | undefined;
            let countryName: string | undefined;
            let defaultCurrency: string = 'USD';
            let userCurrency: string | undefined;

            // ✅ Récupérer l'IP publique du serveur
            const serverPublicIp = await this.getServerPublicIp();
            const serverLocalIp = this.getServerLocalIp();

            console.log(`🖥️ IP Publique du serveur: ${serverPublicIp}`);
            console.log(`🖥️ IP Locale du serveur: ${serverLocalIp}`);
            console.log(`🌍 IP du client: ${ip}`);
            console.log(`📍 CountryId fourni: ${countryId || 'Aucun'}`);
            console.log(`👤 UserId fourni: ${userId || 'Aucun'}`);

            // ✅ 1. Récupérer la devise de l'utilisateur depuis user_settings
            if (userId) {
                const userSettings = await this.userSettingsRepo.findOne({
                    where: { userId: userId },
                    select: ['currency'],
                });
                if (userSettings?.currency) {
                    userCurrency = userSettings.currency;
                    console.log(`💱 Devise de l'utilisateur: ${userCurrency}`);
                }
            }

            // ✅ 2. PRIORITÉ : Si countryId est fourni, l'utiliser pour le pays
            if (countryId) {
                const country = await this.countryRepository.findOne({
                    where: { id: countryId },
                });

                if (country && country.code) {
                    countryCode = country.code;
                    countryName = country.name;
                    console.log(`🌍 Pays trouvé via countryId: ${country.name} (${country.code})`);

                    // ✅ Mapping des pays avec leurs devises
                    const countryCurrencyMap: Record<string, {
                        currencies: string[];
                        defaultCurrency: string;
                        name: string;
                        code: string;
                    }> = {
                        'CD': {
                            currencies: ['USD', 'CDF'],
                            defaultCurrency: 'CDF',
                            name: 'République Démocratique du Congo',
                            code: 'CD'
                        },
                        'COD': {
                            currencies: ['USD', 'CDF'],
                            defaultCurrency: 'CDF',
                            name: 'République Démocratique du Congo',
                            code: 'CD'
                        },
                        'BJ': {
                            currencies: ['USD', 'XOF'],
                            defaultCurrency: 'XOF',
                            name: 'Bénin',
                            code: 'BJ'
                        },
                        'BEN': {
                            currencies: ['USD', 'XOF'],
                            defaultCurrency: 'XOF',
                            name: 'Bénin',
                            code: 'BJ'
                        },
                        'AE': {
                            currencies: ['USD', 'AED'],
                            defaultCurrency: 'USD',
                            name: 'United Arab Emirates',
                            code: 'AE'
                        },
                        'ARE': {
                            currencies: ['USD', 'USD'],
                            defaultCurrency: 'USD',
                            name: 'United Arab Emirates',
                            code: 'AE'
                        },
                        'UG': {
                            currencies: ['USD', 'UGX'],
                            defaultCurrency: 'UGX',
                            name: 'Uganda',
                            code: 'UG'
                        },
                        'BI': {
                            currencies: ['USD', 'BIF'],
                            defaultCurrency: 'BIF',
                            name: 'Burundi',
                            code: 'BI'
                        }
                    };

                    const countryData = countryCurrencyMap[country.code];
                    if (countryData) {
                        defaultCurrency = countryData.defaultCurrency;
                        console.log(`💰 Devise par défaut pour ${country.name}: ${defaultCurrency}`);
                    }
                } else {
                    console.log(`⚠️ Pays avec ID ${countryId} non trouvé`);
                }
            }

            // ✅ 3. Si countryId n'est PAS fourni, détection par IP
            if (!countryCode) {
                let ipToUse = ip;

                if (ipToUse === 'server' || ipToUse === '127.0.0.1' || ipToUse === '::1' || ipToUse === 'localhost') {
                    ipToUse = serverPublicIp !== '127.0.0.1' ? serverPublicIp : serverLocalIp;
                }

                console.log(`🌍 Détection du pays avec l'IP: ${ipToUse}`);

                // ✅ Vérifier les plages IP de la RDC
                const ipParts = ipToUse.split('.');
                if (ipParts.length === 4) {
                    const firstOctet = parseInt(ipParts[0]);
                    const secondOctet = parseInt(ipParts[1]);

                    if ((firstOctet === 41 && secondOctet === 243) ||
                        (firstOctet === 196 && secondOctet === 250) ||
                        (firstOctet === 154) ||
                        (firstOctet === 197) ||
                        (firstOctet === 41 && secondOctet === 242)) {
                        countryCode = 'CD';
                        countryName = 'République Démocratique du Congo';
                        console.log(`🌍 IP ${ipToUse} détectée comme RDC (plage IP)`);
                    }
                }

                // ✅ Si pas encore détecté, appeler l'API
                if (!countryCode) {
                    try {
                        const response = await firstValueFrom(
                            this.httpService.get(`https://ipapi.co/${ipToUse}/json/`, { timeout: 5000 }),
                        );

                        const countryIso = response.data?.country;
                        const detectedCountryName = response.data?.country_name;

                        console.log(`🌍 Pays détecté par ipapi: ${countryIso} - ${detectedCountryName}`);

                        if (countryIso) {
                            countryCode = countryIso;
                            countryName = detectedCountryName || countryIso;
                        }
                    } catch (apiError) {
                        console.error('❌ Erreur API ipapi:', apiError.message);

                        try {
                            const fallbackResponse = await firstValueFrom(
                                this.httpService.get(`http://ip-api.com/json/${ipToUse}`, { timeout: 5000 }),
                            );

                            if (fallbackResponse.data?.status === 'success') {
                                const countryIso = fallbackResponse.data.countryCode;
                                const detectedCountryName = fallbackResponse.data.country;

                                console.log(`🌍 Pays détecté par fallback: ${countryIso} - ${detectedCountryName}`);

                                if (countryIso) {
                                    countryCode = countryIso;
                                    countryName = detectedCountryName || countryIso;
                                }
                            }
                        } catch (fallbackError) {
                            console.error('❌ Erreur fallback API:', fallbackError.message);
                        }
                    }
                }

                // Si toujours pas de pays détecté, utiliser CD par défaut
                if (!countryCode) {
                    countryCode = 'CD';
                    countryName = 'République Démocratique du Congo';
                    console.log(`🌍 Aucun pays détecté, utilisation de CD par défaut`);
                }
            }

            // ✅ 4. Récupérer TOUTES les devises (SANS FILTRE PAYS)
            const allExchangeRates = await this.exchangeRateRepo
                .createQueryBuilder('rate')
                .where('rate.deleted = :deleted', { deleted: false })
                .andWhere('rate.status = :status', { status: true })
                .select(['rate.currency', 'rate.value', 'rate.status'])
                .orderBy('rate.currency', 'ASC')
                .getMany();

            console.log(`📊 Toutes les devises trouvées: ${allExchangeRates.map(r => r.currency).join(', ')}`);

            let finalCurrencies: { currency: string; value: number; status: boolean }[] = [];

            if (allExchangeRates.length > 0) {
                finalCurrencies = allExchangeRates.map(rate => ({
                    currency: rate.currency,
                    value: Number(rate.value),
                    status: rate.status
                }));
            } else {
                finalCurrencies = [{ currency: 'USD', value: 1, status: true }];
            }

            // ✅ 5. Déterminer la devise par défaut
            // ✅ Priorité 1 : Devise de l'utilisateur (si elle existe dans les devises disponibles)
            if (userCurrency && finalCurrencies.some(c => c.currency === userCurrency)) {
                defaultCurrency = userCurrency;
                console.log(`💱 Devise par défaut = devise de l'utilisateur: ${defaultCurrency}`);
            }
            // ✅ Priorité 2 : Devise par défaut du pays
            else if (countryCode === 'AE' || countryCode === 'ARE') {
                defaultCurrency = 'AED';
            } else if (countryCode === 'CD' || countryCode === 'COD') {
                defaultCurrency = 'CDF';
            } else if (countryCode === 'BJ' || countryCode === 'BEN') {
                defaultCurrency = 'XOF';
            } else if (countryCode === 'UG') {
                defaultCurrency = 'UGX';
            } else if (countryCode === 'BI') {
                defaultCurrency = 'BIF';
            } else {
                defaultCurrency = 'USD';
            }

            console.log(`💰 Devise par défaut finale: ${defaultCurrency}`);

            return {
                message: 'Devises récupérées avec succès',
                data: {
                    defaultCurrency,  // ✅ Contient la devise de l'utilisateur si disponible
                    currencies: finalCurrencies,
                    countryCode: countryCode || 'CD',
                    countryName: countryName || 'République Démocratique du Congo',
                    ip: ip || '127.0.0.1',
                    serverInfo: {
                        publicIp: serverPublicIp,
                        localIp: serverLocalIp,
                    }
                }
            };

        } catch (error) {
            console.error('❌ Erreur getCurrencyByIp:', error);

            return {
                message: 'Erreur lors de la récupération, valeur par défaut',
                data: {
                    defaultCurrency: 'USD',
                    currencies: [{ currency: 'USD', value: 1, status: true }],
                    countryCode: 'CD',
                    countryName: 'République Démocratique du Congo',
                    ip: ip || '127.0.0.1'
                }
            };
        }
    }
}