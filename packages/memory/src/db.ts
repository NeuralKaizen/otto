import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient();
  }
  return _client;
}

export async function disconnectDb(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}
