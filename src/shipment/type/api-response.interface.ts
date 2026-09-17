// types/api-response.interface.ts
export interface ApiResponse<T = any> {
  message: string;
  data?: T;
  error?: string;
  statusCode?: number;
}
