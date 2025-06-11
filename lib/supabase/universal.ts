import { getClientSupabase } from './client';
import type { Database } from './database.types';

let universalClient: ReturnType<typeof getClientSupabase> | null = null;

export const getUniversalSupabase = async () => {
  if (!universalClient) {
    universalClient = getClientSupabase();
  }
  return universalClient;
};

export type { Database };