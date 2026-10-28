import {loadCompanyConfig, type CompanyConfig} from './config.ts';

/** Load full workspace configuration only after the session cookie is established. */
export async function signInWithPassword(password: string, request: typeof fetch = fetch): Promise<CompanyConfig> {
  const response = await request('/api/login', {
    method: 'POST', credentials: 'same-origin',
    headers: {'content-type': 'application/json'}, body: JSON.stringify({password}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {error?: string} | null;
    throw Error(body?.error || 'Could not sign in. Check your password and try again.');
  }
  return loadCompanyConfig(request);
}
