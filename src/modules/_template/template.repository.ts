// Placeholder repository. This module owns no Prisma model, so it keeps
// an in-memory store purely so the template compiles and demonstrates the
// shape. Real modules replace this with Prisma calls scoped to model(s)
// this module owns — see modules/qr/qr.repository.ts.
interface TemplateRow {
  id: string;
  name: string;
  createdAt: Date;
}

export function createTemplateRepository() {
  const rows = new Map<string, TemplateRow>();
  return {
    create: (row: TemplateRow): TemplateRow => {
      rows.set(row.id, row);
      return row;
    },
    findById: (id: string): TemplateRow | null => rows.get(id) ?? null,
    list: (): TemplateRow[] => [...rows.values()],
  };
}

export type TemplateRepository = ReturnType<typeof createTemplateRepository>;
