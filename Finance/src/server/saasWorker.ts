/// <reference types="@cloudflare/workers-types" />
// The multi-church Worker's entry (wrangler.saas.toml). Only the handler and
// the Durable Object class are exported: the Workers runtime treats every
// export of the entry module as an entry point.
import { handleSaasRequest, type SaasEnv } from './saas';

export { ChurchStore } from './churchStore';

export default {
  fetch: (request, env) => handleSaasRequest(request, env),
} satisfies ExportedHandler<SaasEnv>;
