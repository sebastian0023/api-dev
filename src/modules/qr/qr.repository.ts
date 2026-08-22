import type { Db } from "../../core/db.js";

// The only file in this module allowed to touch QrCode via Prisma. No
// other module may import this file.
export function createQrRepository(db: Db) {
  return {
    create: (data: {
      id: string;
      userId: string;
      payload: string;
      format: string;
      mode: string;
      size?: number;
      errorCorrection?: string;
    }) => db.qrCode.create({ data }),
    findByIdForUser: (id: string, userId: string) => db.qrCode.findFirst({ where: { id, userId } }),
    findById: (id: string) => db.qrCode.findUnique({ where: { id } }),
    listByUser: (userId: string, limit: number) =>
      db.qrCode.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    incrementScanCount: (id: string) => db.qrCode.update({ where: { id }, data: { scanCount: { increment: 1 } } }),
  };
}

export type QrRepository = ReturnType<typeof createQrRepository>;
