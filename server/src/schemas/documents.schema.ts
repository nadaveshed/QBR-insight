import { z } from 'zod';
export const idSchema = z.uuid();
export const listQuerySchema = z.object({
  search: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
