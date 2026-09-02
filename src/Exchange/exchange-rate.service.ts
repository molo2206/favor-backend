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

@Injectable()
export class ExchangeRateService {
    private readonly logger = new Logger(ExchangeRateService.name);

    constructor(
        @InjectRepository(ExchangeRateEntity)
        private readonly exchangeRateRepo: Repository<ExchangeRateEntity>,
        @InjectRepository(Country) // ✅ Ajout
        private readonly countryRepository: Repository<Country>, // ✅ Ajout
        private readonly httpService: HttpService, // ✅ Ajout
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

    async getCurrencyByIp(ip: string, countryId?: string): Promise<{
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
            let currenciesList: string[] = ['USD'];

            const countryCurrencyMap: Record<string, { currencies: string[], defaultCurrency: string, name: string }> = {
                'CD': {
                    currencies: ['CDF', 'USD'],
                    defaultCurrency: 'CDF',
                    name: 'République Démocratique du Congo'
                },
                'BJ': {
                    currencies: ['XOF'],
                    defaultCurrency: 'XOF',
                    name: 'Bénin'
                },
            };

            // ✅ Récupérer l'IP publique du serveur
            const serverPublicIp = await this.getServerPublicIp();
            const serverLocalIp = this.getServerLocalIp();

            console.log(`🖥️ IP Publique du serveur: ${serverPublicIp}`);
            console.log(`🖥️ IP Locale du serveur: ${serverLocalIp}`);

            // ✅ Si countryId est fourni
            if (countryId) {
                const country = await this.countryRepository.findOne({
                    where: { id: countryId },
                });

                if (country && country.code) {
                    countryCode = country.code;
                    countryName = country.name;
                    const data = countryCurrencyMap[country.code];

                    if (data) {
                        currenciesList = data.currencies;
                        defaultCurrency = data.defaultCurrency;
                    }
                }
            }

            // ✅ Si pas de pays spécifié, utiliser l'IP du serveur
            if (!countryId) {
                // Utiliser l'IP publique du serveur pour la détection
                const serverIp = serverPublicIp !== '127.0.0.1' ? serverPublicIp : ip;

                console.log(`🌍 Détection du pays avec l'IP: ${serverIp}`);

                // Vérifier si l'IP est locale
                const isLocalIp = serverIp === '127.0.0.1' ||
                    serverIp === '::1' ||
                    serverIp === 'localhost' ||
                    serverIp.startsWith('192.168') ||
                    serverIp.startsWith('10.') ||
                    serverIp.startsWith('172.');

                if (!isLocalIp) {
                    try {
                        const response = await firstValueFrom(
                            this.httpService.get(`https://ipapi.co/${serverIp}/json/`, {
                                timeout: 5000,
                            }),
                        );

                        const countryIso = response.data?.country;
                        countryName = response.data?.country_name;

                        console.log(`🌍 Pays détecté par IP: ${countryIso} - ${countryName}`);

                        if (countryIso) {
                            const data = countryCurrencyMap[countryIso];

                            if (data) {
                                countryCode = countryIso;
                                currenciesList = data.currencies;
                                defaultCurrency = data.defaultCurrency;
                            }
                        }
                    } catch (apiError) {
                        console.error('❌ Erreur API ipapi:', apiError.message);
                    }
                } else {
                    console.log('📍 IP locale détectée, utilisation de l\'IP publique du serveur');

                    // Si l'IP est locale, essayer avec l'IP publique
                    if (serverPublicIp && serverPublicIp !== '127.0.0.1') {
                        try {
                            const response = await firstValueFrom(
                                this.httpService.get(`https://ipapi.co/${serverPublicIp}/json/`, {
                                    timeout: 5000,
                                }),
                            );

                            const countryIso = response.data?.country;
                            countryName = response.data?.country_name;

                            if (countryIso) {
                                const data = countryCurrencyMap[countryIso];

                                if (data) {
                                    countryCode = countryIso;
                                    currenciesList = data.currencies;
                                    defaultCurrency = data.defaultCurrency;
                                }
                            }
                        } catch (apiError) {
                            console.error('❌ Erreur API ipapi:', apiError.message);
                        }
                    }
                }
            }

            // Récupérer les taux de change
            const exchangeRates = await this.exchangeRateRepo
                .createQueryBuilder('rate')
                .where('rate.currency IN (:...currencies)', { currencies: currenciesList })
                .andWhere('rate.deleted = :deleted', { deleted: false })
                .andWhere('rate.status = :status', { status: true })
                .select(['rate.currency', 'rate.value', 'rate.status'])
                .getMany();

            let finalCurrencies: { currency: string; value: number; status: boolean }[] = [];

            if (exchangeRates.length > 0) {
                finalCurrencies = exchangeRates.map(rate => ({
                    currency: rate.currency,
                    value: Number(rate.value),
                    status: rate.status
                }));
            } else {
                const defaultRate = await this.exchangeRateRepo.findOne({
                    where: { currency: 'USD', deleted: false, status: true },
                    select: ['currency', 'value', 'status'],
                });

                if (defaultRate) {
                    finalCurrencies = [{
                        currency: defaultRate.currency,
                        value: Number(defaultRate.value),
                        status: defaultRate.status
                    }];
                } else {
                    finalCurrencies = [{ currency: 'USD', value: 1, status: true }];
                }
            }

            return {
                message: 'Devises récupérées avec succès',
                data: {
                    defaultCurrency,
                    currencies: finalCurrencies,
                    countryCode,
                    countryName: countryName || 'Pays non reconnu',
                    ip: ip || '127.0.0.1',
                    serverInfo: {
                        publicIp: serverPublicIp,
                        localIp: serverLocalIp,
                    }
                }
            };

        } catch (error) {
            console.error('❌ Erreur getCurrencyByIp:', error);

            const defaultRate = await this.exchangeRateRepo.findOne({
                where: { currency: 'USD', deleted: false, status: true },
                select: ['currency', 'value', 'status'],
            });

            let defaultCurrencies: { currency: string; value: number; status: boolean }[] = [];

            if (defaultRate) {
                defaultCurrencies = [{
                    currency: defaultRate.currency,
                    value: Number(defaultRate.value),
                    status: defaultRate.status
                }];
            } else {
                defaultCurrencies = [{ currency: 'USD', value: 1, status: true }];
            }

            return {
                message: 'Erreur lors de la récupération, valeur par défaut',
                data: {
                    defaultCurrency: 'USD',
                    currencies: defaultCurrencies,
                    countryCode: 'US',
                    countryName: 'États-Unis (défaut)',
                    ip: ip || '127.0.0.1'
                }
            };
        }
    }
}