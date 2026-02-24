/** Channel configuration - extensible for future channels */

export type ChannelType = 'discord_dm' | 'discord_channel' | 'sms' | 'email' | 'slack' | 'bulk';

export interface ChannelConfig {
  type: ChannelType;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}

export const CHANNELS: Record<string, ChannelConfig> = {
  dm: {
    type: 'discord_dm',
    label: 'Discord DM',
    shortLabel: 'Discord',
    color: '#5865F2',
    bgColor: '#EEF0FE',
  },
  channel: {
    type: 'discord_channel',
    label: 'Discord Channel',
    shortLabel: 'Channel',
    color: '#5865F2',
    bgColor: '#EEF0FE',
  },
  bulk: {
    type: 'bulk',
    label: 'Bulk Message',
    shortLabel: 'Bulk',
    color: '#7C5CFC',
    bgColor: '#F3F0FF',
  },
  sms: {
    type: 'sms',
    label: 'SMS',
    shortLabel: 'SMS',
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  email: {
    type: 'email',
    label: 'Email',
    shortLabel: 'Email',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  slack: {
    type: 'slack',
    label: 'Slack',
    shortLabel: 'Slack',
    color: '#E01E5A',
    bgColor: '#FEF2F5',
  },
};

export function getChannelConfig(channel: string): ChannelConfig {
  return CHANNELS[channel] ?? CHANNELS.dm;
}
