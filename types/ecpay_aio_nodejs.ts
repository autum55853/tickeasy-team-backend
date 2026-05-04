/* eslint-disable no-unused-vars */

declare module 'ecpay_aio_nodejs' {
  interface ECPayOptions {
    OperationMode: 'Test' | 'Production';
    MercProfile: {
      MerchantID: string;
      HashKey: string;
      HashIV: string;
    };
    IgnorePayment?: string[];
    IsProjectContractor?: boolean;
  }

  interface PaymentClient {
    aio_check_out_all(baseParam: Record<string, any>, invoice?: any, extra?: any): string;
  }

  class ECPayPayment {
    payment_client: PaymentClient;
    constructor(options: ECPayOptions);
  }

  export = ECPayPayment;
}
