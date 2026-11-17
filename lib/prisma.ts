import "server-only";
import { PrismaClient } from "@prisma/client";
import {
  assertDatabaseEnvironment,
  assertDatabaseOperation,
} from "./database-safety";

assertDatabaseEnvironment();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  (new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        assertDatabaseOperation(operation);
        return query(args);
      },
    },
  }) as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
