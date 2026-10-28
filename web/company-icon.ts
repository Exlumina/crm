/** Use only the saved public website origin, never its path, query or credentials. */
export function companyIconSources(kind: string, website?: string): string[] {
  if (kind !== "company" || !website?.trim()) return [];
  try {
    const input = website.trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
        !host.includes('.') || host.endsWith('.') || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') ||
        /^[\d.]+$/.test(host)) return [];
    return [`https://${host}/favicon.ico`, `https://${host}/apple-touch-icon.png`];
  } catch { return []; }
}

export function recordInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toUpperCase() || '?';
}
