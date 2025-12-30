import { NotificationType } from "../type/notification.type";


export const typeCompanyToNotificationType: Record<string, NotificationType> = {
  RESTAURANT: NotificationType.FOOD,
  CAR: NotificationType.DEALER,
  GROCERY: NotificationType.GROCERY,
  SHOP: NotificationType.SHOP,
  SERVICE: NotificationType.SERVICE,
  WHOLESALER: NotificationType.ECOMMERCE,
  WHOLESALER_RETAILER: NotificationType.ECOMMERCE,
  COMPANY: NotificationType.COMPANY,
};
