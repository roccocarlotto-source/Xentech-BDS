import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
