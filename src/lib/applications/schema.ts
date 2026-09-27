import { z } from 'zod';

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  label: z.string().trim().min(3).max(120),
  required: z.boolean(),
});
export const questionsSchema = z.array(questionSchema).max(12).refine(
  questions => new Set(questions.map(question => question.id)).size === questions.length,
  'Question IDs must be unique',
);
export type ApplicationQuestion = z.infer<typeof questionSchema>;
export const DEFAULT_QUESTIONS: ApplicationQuestion[] = [
  { id: 'content_niche', label: 'What type of content do you create?', required: true },
  { id: 'why_join', label: 'Why do you want to work with this brand?', required: true },
  { id: 'sample_video', label: 'Link to a video that represents your work', required: false },
];

export const submissionSchema = z.object({
  formVersion: z.number().int().positive(),
  fullName: z.string().trim().min(2).max(160),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  tiktokHandle: z.string().trim().min(2).max(80).regex(/^@?[a-zA-Z0-9._]+$/),
  discordUsername: z.string().trim().max(80).optional(),
  answers: z.record(z.string(), z.string().trim().max(3000)),
  website: z.string().optional(), // invisible honeypot
});
