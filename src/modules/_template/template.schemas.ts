import { z } from "zod";

// Rename `Template` throughout when copying this folder for a new module.
export const CreateTemplateBody = z.object({
  name: z.string().min(1).max(200),
});
export type CreateTemplateBody = z.infer<typeof CreateTemplateBody>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const TemplateResource = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export const TemplateListResource = z.array(TemplateResource);
