import { createWebClient } from './web';
import type { Database } from './database.types';

let client: ReturnType<typeof createWebClient> | null = null;

export const getClientSupabase = () => {
  if (!client) {
    client = createWebClient();
  }
  return client;
};

export type { Database };