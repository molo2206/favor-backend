import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { CountryProvider } from './entity/country-provider.entity';
import { NetworkProvider } from './entity/network-provider.entity';
import { Repository } from 'typeorm';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { CreateNetworkDto } from './dto/create-network.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { firstValueFrom } from 'rxjs';

export type OperationType = 'DEPOSIT' | 'REFUND' | 'PAYOUT';
type BulkPayoutResult =
  | {
    payoutId: string;
    status: any;
  }
  | {
    payoutId: string;
    error: string;
  };

@Injectable()
export class PawapayService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(CountryProvider)
    private readonly countryRepo: Repository<CountryProvider>,
    @InjectRepository(NetworkProvider)
    private readonly networkRepo: Repository<NetworkProvider>,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('PAWAPAY_BASE_URL');
    this.token = this.configService.getOrThrow<string>('PAWAPAY_TOKEN');
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  private async fetchAvailability(): Promise<any[]> {
    const url = `${this.baseUrl}/v2/availability`;
    const res$ = this.httpService.get(url, { headers: this.headers });
    return lastValueFrom(res$).then((r) => r.data);
  }

  async getAvailability(
    country?: string,
    operationType?: OperationType,
  ): Promise<any[]> {
    let data = await this.fetchAvailability();

    if (country) {
      data = data.filter(
        (c) => c.country.toUpperCase() === country.toUpperCase(),
      );
    }

    if (operationType) {
      data = data.map((c) => ({
        ...c,
        providers: c.providers.filter(
          (p) => p.operationTypes?.[operationType] === 'OPERATIONAL',
        ),
      }));
    }

    data = data.filter((c) => c.providers.length > 0);

    return data;
  }

  async getActiveConf(
    country?: string,
    operationType?: 'DEPOSIT' | 'PAYOUT' | 'REFUND',
  ) {
    const url = `${this.baseUrl}/v2/active-conf`;
    const res$ = this.httpService.get(url, { headers: this.headers });
    const data = await lastValueFrom(res$).then((r) => r.data);

    const filteredCountries = data.countries
      .filter((c) => !country || c.country === country)
      .map((country) => ({
        ...country,
        providers: country.providers
          .map((provider) => ({
            ...provider,
            currencies: provider.currencies
              .map((currency) => {
                // Filtrer sur operationType uniquement si présent
                if (!operationType) return currency;

                const op = currency.operationTypes?.[operationType];
                if (!op) return null;

                return {
                  ...currency,
                  operationTypes: { [operationType]: op },
                };
              })
              .filter(Boolean),
          }))
          .filter((provider) => provider.currencies.length > 0),
      }))
      .filter((country) => country.providers.length > 0);

    return {
      companyName: data.companyName,
      signatureConfiguration: data.signatureConfiguration,
      countries: filteredCountries,
    };
  }

  async getWalletBalances(country?: string, provider?: string) {
    const url = `${this.baseUrl}/v2/wallet-balances`;
    const res$ = this.httpService.get(url, { headers: this.headers });
    const data = await lastValueFrom(res$).then((r) => r.data);

    let balances = data.balances;

    if (country) {
      balances = balances.filter((b) => b.country === country);
    }

    if (provider) {
      balances = balances.filter(
        (b) =>
          b.provider &&
          b.provider.toLowerCase().includes(provider.toLowerCase()),
      );
    }

    return { balances };
  }

  async createDepositSimple(
    data: {
      amount: string;
      currency: string;
      provider: string;
      phone: string;
    },
    signal?: AbortSignal,
  ): Promise<any> {
    // ✅ Vérifier l'annulation avant de commencer
    if (signal?.aborted) {
      console.log('[PawaPay] ⚠️ Opération annulée avant création du dépôt');
      throw new Error('AbortError');
    }

    // 1️⃣ Création du dépôt
    const depositId = uuidv4();
    const clientReferenceId = `INV-${Date.now()}`;
    const metadata = [
      { orderId: `ORD-${Date.now()}` },
      { customerId: 'favorhelp31@gmail.com', isPII: true },
    ];

    const body = {
      depositId,
      payer: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: data.phone,
          provider: data.provider,
        },
      },
      amount: data.amount,
      currency: data.currency,
      preAuthorisationCode: '3c',
      clientReferenceId,
      customerMessage: 'Note of 4 to 22 chars',
      metadata,
    };

    // ✅ Appel avec signal d'annulation
    let deposit;
    try {
      deposit = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/v2/deposits`, body, {
          headers: this.headers,
          signal,
        }),
      ).then((r) => r.data);
    } catch (error: any) {
      if (error.name === 'AbortError' || signal?.aborted) {
        console.log('[PawaPay] ⚠️ Création du dépôt annulée');
        throw new Error('AbortError');
      }
      // ✅ Propager l'erreur HTTP
      console.error('[PawaPay] ❌ Erreur création dépôt:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message || 'Erreur lors de la création du dépôt');
    }

    console.log('[PawaPay] Dépôt créé :', deposit.depositId);

    // ✅ Vérifier si le dépôt a un statut d'erreur immédiat
    if (deposit.status && deposit.status !== 'PENDING') {
      console.log('[PawaPay] ❌ Statut immédiat:', deposit.status);
      // ✅ Retourner le statut pour que le caller puisse le traiter
      return {
        deposit,
        finalStatus: {
          data: {
            status: deposit.status,
            failureReason: deposit.failureReason || null
          }
        }
      };
    }

    // ✅ Vérifier l'annulation avant le polling
    if (signal?.aborted) {
      console.log('[PawaPay] ⚠️ Opération annulée après création du dépôt');
      throw new Error('AbortError');
    }

    // 2️⃣ Polling jusqu’au statut final
    const finalStatus = await this.pollDepositStatus(deposit.depositId, signal);

    console.log('[PawaPay] Statut final :', finalStatus);

    return {
      deposit,
      finalStatus,
    };
  }

  async createPayoutSimple(
    data: {
      amount: string;
      currency: string;
      provider: string;
      phone: string;
    },
    signal?: AbortSignal,
  ): Promise<any> {
    const payoutId = uuidv4();
    const clientReferenceId = `PAYOUT-${Date.now()}`;

    const metadata = [
      { orderId: `ORD-${Date.now()}` },
      { customerId: 'customer@email.com', isPII: true },
    ];

    const body = {
      payoutId,
      recipient: {
        type: 'MMO',
        accountDetails: {
          provider: data.provider,
          phoneNumber: data.phone,
        },
      },
      amount: data.amount,
      currency: data.currency,
      customerMessage: 'Payment',
      metadata,
    };

    const payout = await lastValueFrom(
      this.httpService.post(`${this.baseUrl}/v2/payouts`, body, {
        headers: this.headers,
        signal,
      }),
    ).then((r) => r.data);

    console.log('[PawaPay] Payout créé :', payout.payoutId);

    // 2️⃣ Polling jusqu’au statut final
    const finalStatus = await this.pollPayoutStatus(payout.payoutId, signal);

    console.log('[PawaPay] Statut final payout :', finalStatus);

    return {
      payout,
      finalStatus,
    };
  }

  async checkDepositStatus(depositId: string, signal?: AbortSignal) {
    return lastValueFrom(
      this.httpService.get(`${this.baseUrl}/v2/deposits/${depositId}`, {
        headers: this.headers,
        signal, // ✔️ doit être présent
      }),
    ).then((r) => r.data);
  }

  private async pollDepositStatus(
    depositId: string,
    signal?: AbortSignal,
    maxRetries = 30,
    intervalMs = 5000,
  ) {
    // ✅ Statuts finaux qui arrêtent le polling
    const finalStatuses = [
      'COMPLETED',
      'REJECTED',
      'FAILED',
      'CANCELED',
      'EXPIRED',
    ];

    // ✅ Statuts temporaires (on continue le polling)
    const pendingStatuses = [
      'ACCEPTED',
      'PENDING',
      'PROCESSING',
      'WAITING',
      'INITIATED',
      'CREATED',
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        console.log('[Polling] ⚠️ Opération annulée');
        throw new Error('AbortError');
      }

      console.log(`[Polling] Tentative ${attempt}/${maxRetries} pour depositId: ${depositId}`);

      let statusResponse;
      try {
        statusResponse = await this.checkDepositStatus(depositId, signal);
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) {
          throw new Error('AbortError');
        }
        console.error('[Polling] ❌ Erreur check status:', err.message);
        throw err;
      }

      const status = statusResponse?.data?.status;
      const failureReason = statusResponse?.data?.failureReason;

      console.log(`[Polling] Statut actuel: ${status}`);

      // ✅ Si statut final, retourner immédiatement
      if (finalStatuses.includes(status)) {
        console.log(`[Polling] ✅ Statut final: ${status}`);
        return statusResponse;
      }

      // ✅ Si statut en attente, continuer le polling
      if (pendingStatuses.includes(status)) {
        console.log(`[Polling] ⏳ Statut en attente: ${status}, continuation du polling...`);
        // On continue la boucle
      } else {
        // ✅ Si statut inconnu, on continue quand même (peut-être un nouveau statut)
        console.log(`[Polling] ⚠️ Statut inconnu: ${status}, continuation du polling...`);
      }

      if (attempt === maxRetries) {
        console.warn(`[Polling] ⚠️ Nombre maximum de tentatives atteint (${maxRetries})`);
        break;
      }

      if (signal?.aborted) {
        throw new Error('AbortError');
      }

      // ✅ Attendre avant la prochaine tentative
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          return reject(new Error('AbortError'));
        }

        const timeout = setTimeout(resolve, intervalMs);

        const abortHandler = () => {
          clearTimeout(timeout);
          reject(new Error('AbortError'));
        };

        signal?.addEventListener('abort', abortHandler, { once: true });

        const originalResolve = resolve;
        resolve = () => {
          signal?.removeEventListener('abort', abortHandler);
          originalResolve();
        };
      });
    }

    // ✅ Si on arrive ici, c'est un TIMEOUT (aucun statut final atteint)
    console.warn(`[Polling] ⚠️ TIMEOUT pour depositId: ${depositId} après ${maxRetries} tentatives`);
    return {
      data: {
        status: 'TIMEOUT',
        failureReason: {
          failureCode: 'POLLING_TIMEOUT',
          failureMessage: `Le paiement est en attente depuis trop longtemps (${maxRetries * intervalMs / 1000}s). Veuillez vérifier le statut manuellement.`
        }
      }
    };
  }

  async checkPayoutStatus(payoutId: string, signal?: AbortSignal) {
    const url = `${this.baseUrl}/v2/payouts/${payoutId}`;
    return lastValueFrom(
      this.httpService.get(url, {
        headers: this.headers,
        signal,
      }),
    ).then((r) => r.data);
  }

  private async pollPayoutStatus(
    payoutId: string,
    signal?: AbortSignal,
    maxRetries = 40,
    intervalMs = 4000,
  ) {
    const finalStatuses = [
      'COMPLETED',
      'FAILED',
      'CANCELED',
      'EXPIRED',
      'REJECTED',
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        console.warn('[PawaPay][Payout Polling] Annulé');
        throw new Error('AbortError');
      }

      console.log(
        `[PawaPay][Payout Polling] Tentative ${attempt}/${maxRetries}`,
      );

      const statusResponse = await this.checkPayoutStatus(payoutId, signal);
      const status = statusResponse?.data?.status;

      console.log(`[PawaPay][Payout Polling] Statut actuel : ${status}`);

      if (finalStatuses.includes(status)) {
        console.log(`[PawaPay][Payout Polling] Statut final : ${status}`);
        return statusResponse;
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, intervalMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('AbortError'));
          },
          { once: true },
        );
      });
    }

    return {
      message: 'Statut du payout non confirmé après polling',
      payoutId,
      attempts: maxRetries,
    };
  }

  async handlePayoutWebhook(payload: any) {
    const { payoutId, status } = payload;
    console.log(`Webhook payout reçu : ${payoutId} avec statut ${status}`);

    // Ici : update DB, notifier user, etc.
    return { message: 'Webhook payout traité avec succès' };
  }

  async handleDepositWebhook(payload: any) {
    const { depositId, status } = payload;
    console.log(`Webhook reçu pour ${depositId} avec statut ${status}`);
    return { message: 'Webhook traité avec succès' };
  }

  async createBulkPayout(
    payouts: Array<{
      amount: string;
      currency: string;
      provider: string;
      phone: string;
      orderId?: string;
    }>,
    signal?: AbortSignal,
  ) {
    const body = payouts.map((p) => ({
      payoutId: uuidv4(),
      amount: p.amount,
      currency: p.currency,
      recipient: {
        type: 'MMO',
        accountDetails: {
          provider: p.provider,
          phoneNumber: p.phone,
        },
      },
      customerMessage: 'Payment',
      metadata: [
        { orderId: p.orderId ?? `ORD-${Date.now()}` },
        { customerId: 'favorhelp31@gmail.com', isPII: true },
      ],
    }));

    const response = await lastValueFrom(
      this.httpService.post(`${this.baseUrl}/v2/payouts/bulk`, body, {
        headers: this.headers,
        signal,
      }),
    ).then((r) => r.data);

    console.log('[PawaPay][Bulk Payout] Créés :', body.length);

    return {
      count: body.length,
      payouts: response,
    };
  }

  async pollBulkPayoutStatus(payoutIds: string[], signal?: AbortSignal) {
    const results: BulkPayoutResult[] = [];

    for (const payoutId of payoutIds) {
      try {
        const status = await this.pollPayoutStatus(payoutId, signal);

        results.push({
          payoutId,
          status,
        });
      } catch (e: any) {
        results.push({
          payoutId,
          error: e.message,
        });
      }
    }

    return results;
  }

  // --- CountryProvider CRUD ---
  async createCountry(dto: CreateCountryDto) {
    const country = this.countryRepo.create(dto);
    const saved = await this.countryRepo.save(country);
    return {
      message: 'Country created successfully',
      data: saved,
    };
  }

  async updateCountry(id: string, dto: UpdateCountryDto) {
    const country = await this.countryRepo.findOne({ where: { id } });
    if (!country) {
      return {
        message: 'Country not found',
        data: null,
      };
    }

    await this.countryRepo.update(id, dto);
    const updated = await this.countryRepo.findOne({
      where: { id },
      relations: ['networkProviders'],
    });
    return {
      message: 'Country updated successfully',
      data: updated,
    };
  }

  async getCountry(id: string) {
    const country = await this.countryRepo.findOne({
      where: { id },
      relations: ['networkProviders'],
    });
    if (!country) {
      return {
        message: 'Country not found',
        data: null,
      };
    }
    return {
      message: 'Country retrieved successfully',
      data: country,
    };
  }

  async getAllCountries() {
    const countries = await this.countryRepo.find({
      relations: ['networkProviders'],
    });
    return {
      message: 'Countries retrieved successfully',
      data: countries,
    };
  }

  // --- NetworkProvider CRUD ---
  async createNetwork(dto: CreateNetworkDto) {
    const country = await this.countryRepo.findOne({
      where: { id: dto.countryId },
    });
    if (!country) {
      return {
        message: 'Country not found',
        data: null,
      };
    }

    const network = new NetworkProvider();
    network.name = dto.name;
    network.currency = dto.currency.split(',').map((c) => c.trim());
    network.pourcentage = dto.pourcentage;
    network.image = dto.image;
    network.country = country;

    const saved = await this.networkRepo.save(network);
    return {
      message: 'Network provider created successfully',
      data: saved,
    };
  }

  async updateNetwork(id: string, dto: UpdateNetworkDto) {
    const network = await this.networkRepo.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!network) {
      return {
        message: 'Network provider not found',
        data: null,
      };
    }

    if (dto.name) network.name = dto.name;
    if (dto.currency)
      network.currency = dto.currency.split(',').map((c) => c.trim());
    if (dto.pourcentage !== undefined) network.pourcentage = dto.pourcentage;
    if (dto.image) network.image = dto.image;
    if (dto.countryId) {
      const country = await this.countryRepo.findOne({
        where: { id: dto.countryId },
      });
      if (!country) return { message: 'Country not found', data: null };
      network.country = country;
    }

    const updated = await this.networkRepo.save(network);
    return {
      message: 'Network provider updated successfully',
      data: updated,
    };
  }

  async getNetwork(id: string) {
    const network = await this.networkRepo.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!network) {
      return {
        message: 'Network provider not found',
        data: null,
      };
    }
    return {
      message: 'Network provider retrieved successfully',
      data: network,
    };
  }

  async getAllNetworks() {
    const networks = await this.networkRepo.find({ relations: ['country'] });
    return {
      message: 'Network providers retrieved successfully',
      data: networks,
    };
  }
  private mapIsoToPawapayCode(iso: string): string | null {
    const map: Record<string, string> = {
      CD: 'COD', // RDC
      CG: 'COG', // Congo Brazzaville
      CI: 'CIV', // Côte d’Ivoire
      CM: 'CMR', // Cameroun
      KE: 'KEN', // Kenya
      RW: 'RWA', // Rwanda
      UG: 'UGA', // Ouganda
      TZ: 'TZA', // Tanzanie
      SN: 'SEN', // Sénégal
      SL: 'SLE', // Sierra Leone
      GA: 'GAB', // Gabon
      BJ: 'BEN', // Bénin
      ZM: 'ZMB', // Zambie
    };

    return map[iso.toUpperCase()] ?? null;
  }

  // private ipCache = new Map<string, any>();

  // async getCountryByCode(ip: string) {
  //   try {
  //     // -------------------
  //     // 0) Vérifier le cache
  //     // -------------------
  //     if (this.ipCache.has(ip)) {
  //       return this.ipCache.get(ip);
  //     }

  //     // -------------------
  //     // 1) IP locale / privée
  //     // -------------------
  //     if (
  //       !ip ||
  //       ip === '127.0.0.1' ||
  //       ip === '::1' ||
  //       ip.startsWith('192.168') ||
  //       ip.startsWith('10.') ||
  //       ip.startsWith('172.')
  //     ) {
  //       return await this.getDefaultCountry();
  //     }

  //     // -------------------
  //     // 2) Appel ipapi
  //     // -------------------
  //     const response = await firstValueFrom(
  //       this.httpService.get(`https://ipapi.co/${ip}/json/`, {
  //         timeout: 5000,
  //       }),
  //     );

  //     // Si ipapi renvoie RateLimited
  //     if (response.data?.error) {
  //       console.warn('ipapi limité:', response.data);
  //       return await this.getDefaultCountry();
  //     }

  //     const countryIso = response.data?.country;
  //     if (!countryIso) {
  //       return await this.getDefaultCountry();
  //     }

  //     const pawapayCode = this.mapIsoToPawapayCode(countryIso);
  //     if (!pawapayCode) {
  //       return await this.getDefaultCountry();
  //     }

  //     const country = await this.countryRepo.findOne({
  //       where: { code: pawapayCode },
  //       relations: ['networkProviders'],
  //     });

  //     if (!country) {
  //       return await this.getDefaultCountry();
  //     }

  //     const result = {
  //       message: `Pays "${pawapayCode}" récupéré avec succès`,
  //       data: country,
  //     };

  //     // Sauvegarder dans le cache
  //     this.ipCache.set(ip, result);

  //     return result;
  //   } catch (err: any) {
  //     console.error(
  //       'Erreur récupération pays par IP :',
  //       err.response?.data || err.message,
  //     );
  //     return await this.getDefaultCountry();
  //   }
  // }
  async getCountryByCode(ip: string) {
    try {
      // Code pays forcé (RDC)
      const countryCode = 'COD';

      const country = await this.countryRepo.findOne({
        where: { code: countryCode },
        relations: ['networkProviders'],
      });

      if (!country) {
        return await this.getDefaultCountry();
      }

      return {
        message: `Pays "${countryCode}" défini par défaut`,
        data: country,
      };
    } catch (err: any) {
      console.error(
        'Erreur récupération pays :',
        err.response?.data || err.message,
      );
      return await this.getDefaultCountry();
    }
  }

  // -------------------
  // 3) Fallback pays par défaut
  // -------------------
  private async getDefaultCountry() {
    const defaultCode = 'CD'; // Code Pawapay pour RDC

    const country = await this.countryRepo.findOne({
      where: { code: defaultCode },
      relations: ['networkProviders'],
    });

    if (!country) {
      return {
        message: 'Pays par défaut introuvable dans la base',
        data: null,
      };
    }

    return {
      message: `Pays par défaut "${defaultCode}" retourné`,
      data: country,
    };
  }
}
