/** Message templates with variable support */

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  content: string;
  variables: string[];
  description: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome',
    category: 'Onboarding',
    icon: '👋',
    content: 'Hey {creator_name}! Welcome to the {brand_name} team. We are so excited to have you on board! If you have any questions about posting or need content ideas, just let me know. Looking forward to seeing your first video!',
    variables: ['creator_name', 'brand_name'],
    description: 'New creator onboarding welcome message',
  },
  {
    id: 'retainer_reminder',
    name: 'Retainer Reminder',
    category: 'Reminders',
    icon: '📋',
    content: 'Hey {creator_name}! Just a friendly reminder that you need {post_count} more posts this month to hit your target. You have got this! Let me know if you need any product or content ideas.',
    variables: ['creator_name', 'post_count'],
    description: 'Remind creators about remaining posts for the month',
  },
  {
    id: 'performance_shoutout',
    name: 'Performance Shoutout',
    category: 'Recognition',
    icon: '🌟',
    content: 'Amazing work, {creator_name}! Your recent video just hit ${gmv} in GMV. That is incredible performance! Keep up the great content.',
    variables: ['creator_name', 'gmv'],
    description: 'Celebrate a high-performing video',
  },
  {
    id: 'check_in',
    name: 'Check-in',
    category: 'General',
    icon: '💬',
    content: 'Hey {creator_name}! Just checking in to see how things are going. Need any product samples, content ideas, or support from us? We are here to help!',
    variables: ['creator_name'],
    description: 'General check-in with a creator',
  },
  {
    id: 'inactivity_nudge',
    name: 'Inactivity Nudge',
    category: 'Re-engagement',
    icon: '🔔',
    content: 'Hey {creator_name}! We have not seen a post from you in a while and wanted to check in. Is everything okay? We would love to see you back posting for {brand_name}. Let me know if there is anything I can help with!',
    variables: ['creator_name', 'brand_name'],
    description: 'Reach out to inactive creators',
  },
  {
    id: 'gmv_milestone',
    name: 'GMV Milestone',
    category: 'Recognition',
    icon: '🎉',
    content: 'Congrats {creator_name}! You just crossed ${gmv} in total GMV for {brand_name}. That is a huge milestone. We really appreciate your work!',
    variables: ['creator_name', 'gmv', 'brand_name'],
    description: 'Celebrate hitting a GMV milestone',
  },
];

/** Replace template variables with actual values */
export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

/** Get unique variable names from a template string */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}
