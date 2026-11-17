import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PATTERNS, RpcEnvelope, CreateUserPaymentMethodDto, UpdateUserPaymentMethodDto } from '@favor/contracts';
import { PaymentMethodsService } from './payment-methods.service';

/** Messages RabbitMQ reçus de l'api-gateway (le corps est déjà validé par la gateway) */
@Controller()
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) { }

  @MessagePattern(PATTERNS.PAYMENT_METHODS.LIST)
  list(@Payload() m: RpcEnvelope) {
    return this.service.list(this.service.userIdOf(m), m.lang);
  }

  @MessagePattern(PATTERNS.PAYMENT_METHODS.CREATE)
  create(@Payload() m: RpcEnvelope<CreateUserPaymentMethodDto>) {
    return this.service.create(this.service.userIdOf(m), m.body as CreateUserPaymentMethodDto, m.lang);
  }

  @MessagePattern(PATTERNS.PAYMENT_METHODS.UPDATE)
  update(@Payload() m: RpcEnvelope<UpdateUserPaymentMethodDto>) {
    return this.service.update(this.service.userIdOf(m), String(m.params?.id), m.body as UpdateUserPaymentMethodDto, m.lang);
  }

  @MessagePattern(PATTERNS.PAYMENT_METHODS.SET_DEFAULT)
  setDefault(@Payload() m: RpcEnvelope) {
    return this.service.setDefault(this.service.userIdOf(m), String(m.params?.id), m.lang);
  }

  @MessagePattern(PATTERNS.PAYMENT_METHODS.REMOVE)
  remove(@Payload() m: RpcEnvelope) {
    return this.service.remove(this.service.userIdOf(m), String(m.params?.id), m.lang);
  }

  /** Pour les autres services : moyen enregistré → mode, opérateur, numéro */
  @MessagePattern(PATTERNS.PAYMENT_METHODS.RESOLVE)
  resolve(@Payload() m: RpcEnvelope<{ id: string }>) {
    return this.service.resolve(this.service.userIdOf(m), String(m.body?.id), m.lang);
  }

  @MessagePattern(PATTERNS.HEALTH)
  health() {
    return { service: 'payment-methods', status: 'ok', at: new Date().toISOString() };
  }
}
