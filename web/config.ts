export type CompanyBoard = { id: string; name: string; stages: string[]; stageDescriptions?: Record<string, string> };
export type CompanyConfig = { name: string; timezone: string; loadCompanyIcons: boolean; boards: CompanyBoard[] };

export async function loadCompanyConfig(request: typeof fetch = fetch): Promise<CompanyConfig> {
  const response = await request('/api/config', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw Error('Could not load company configuration.');
  return readCompanyConfig(await response.json());
}

export function readCompanyConfig(value: unknown): CompanyConfig {
  if (!value || typeof value !== 'object') throw Error('Company configuration is unavailable.');
  const c = value as Record<string, unknown>;
  if (typeof c.name !== 'string' || !c.name.trim() || typeof c.timezone !== 'string' || !Array.isArray(c.boards)) throw Error('Company configuration is invalid.');
  new Intl.DateTimeFormat('en', { timeZone: c.timezone });
  if (!c.boards.every(b => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.name === 'string' && Array.isArray(b.stages) && b.stages.every((s: unknown) => typeof s === 'string'))) throw Error('Board configuration is invalid.');
  return { name: c.name, timezone: c.timezone, loadCompanyIcons: c.loadCompanyIcons === true, boards: c.boards as CompanyBoard[] };
}
