import type { PaymentChannel } from '@hanjing/shared';
import type { TFunction } from 'i18next';

/** A channel name typed in Settings wins; otherwise the translated default (004 FR-027). */
export function channelName(channel: PaymentChannel, configName: string | null | undefined, t: TFunction): string {
  return configName || t(`paymentChannel.${channel}`);
}
