import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IpReputationService } from './ip-reputation.service';
import { ProxyBlockMiddleware } from './proxy-block.middleware';

/** ✅ Filtre VPN / proxy / Tor (voir ProxyBlockMiddleware pour les réglages .env) */
@Global()
@Module({
  imports: [HttpModule],
  providers: [IpReputationService, ProxyBlockMiddleware],
  exports: [IpReputationService],
})
export class ProxyBlockModule { }
