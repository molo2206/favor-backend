/** Noms des services (injection ClientProxy) et files RabbitMQ */
export const SERVICES = {
  PAYMENT_METHODS: 'PAYMENT_METHODS_SERVICE',
  SETTINGS: 'SETTINGS_SERVICE',
} as const;

export const QUEUES = {
  PAYMENT_METHODS: process.env.RMQ_QUEUE_PAYMENT_METHODS || 'favor.payment_methods',
  SETTINGS: process.env.RMQ_QUEUE_SETTINGS || 'favor.settings',
} as const;

/** Motifs des messages (request / response) */
export const PATTERNS = {
  PAYMENT_METHODS: {
    LIST: 'payment_methods.list',
    CREATE: 'payment_methods.create',
    UPDATE: 'payment_methods.update',
    SET_DEFAULT: 'payment_methods.set_default',
    REMOVE: 'payment_methods.remove',
    RESOLVE: 'payment_methods.resolve',
  },
  SETTINGS: {
    GET: 'settings.get',
  },
  HEALTH: 'health.ping',
} as const;

export function rabbitUrls(): string[] {
  return String(process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}
