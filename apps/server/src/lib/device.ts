import Bowser from 'bowser';

/** Human-readable device label from a User-Agent, e.g. "iPhone · Safari" or "Windows · Chrome". */
export function deviceLabelFromUserAgent(userAgent: string): string {
  if (!userAgent) return 'Unknown device';
  try {
    const parsed = Bowser.parse(userAgent);
    const device = parsed.platform.model || parsed.os.name || parsed.platform.type || 'Unknown device';
    const browser = parsed.browser.name || 'Unknown browser';
    return `${device} · ${browser}`;
  } catch {
    return 'Unknown device';
  }
}
