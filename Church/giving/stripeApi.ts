/**
 * Stripe REST API 客戶端（只用得到的部分）。
 *
 * 直接用 fetch 而非 Node SDK：SDK 在 Workers 需要額外的 http client 設定，
 * 而我們只需要一個端點。與 server.ts 呼叫 Resend 的做法一致。
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** Stripe 只吃 application/x-www-form-urlencoded，巢狀結構用 a[b] 表示。 */
function toFormBody(data: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  return params.toString();
}

export type CreatePaymentIntentParams = {
  /** 實際扣款金額（分） */
  grossCents: number;
  currency: string;
  receiptEmail: string;
  /** 用來讓同一次送出重試時不會產生兩筆 PaymentIntent */
  idempotencyKey: string;
  metadata: Record<string, string>;
};

/**
 * 注意那幾個 `?: undefined` 欄位不是贅字，拿掉會編不過。
 *
 * 本專案的 tsconfig 沒有開 `strict`（因此 `strictNullChecks` 為 false），
 * 在這個設定下 TypeScript 不會用 `if (!r.ok)` 這類真假值判斷把可辨識聯合
 * 收斂到某一分支 —— `intent.error` 會報 TS2339。加上共用的 optional
 * 欄位後，兩個分支都有這些屬性，收斂失敗也能編譯。純型別層，執行期毫無差異。
 * Task 3 的 ValidationResult 出於同樣原因也是這樣寫的。
 */
export type CreatePaymentIntentResult =
  | { ok: true; id: string; clientSecret: string; error?: undefined }
  | { ok: false; error: string; id?: undefined; clientSecret?: undefined };

export async function createPaymentIntent(
  secretKey: string,
  params: CreatePaymentIntentParams,
): Promise<CreatePaymentIntentResult> {
  const body: Record<string, string | number | boolean> = {
    amount: params.grossCents,
    currency: params.currency,
    receipt_email: params.receiptEmail,
    // 讓 Stripe 後台決定啟用哪些付款方式（卡片、Apple Pay、Google Pay…），
    // 不必在程式碼裡逐一列舉
    'automatic_payment_methods[enabled]': true,
  };
  for (const [key, value] of Object.entries(params.metadata)) {
    body[`metadata[${key}]`] = value;
  }

  try {
    const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': params.idempotencyKey,
      },
      body: toFormBody(body),
    });

    const payload = await response.json<{
      id?: string;
      client_secret?: string;
      error?: { message?: string };
    }>();

    if (!response.ok || !payload.id || !payload.client_secret) {
      return { ok: false, error: payload.error?.message || `Stripe HTTP ${response.status}` };
    }
    return { ok: true, id: payload.id, clientSecret: payload.client_secret };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
