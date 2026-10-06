import { createMockApi } from './mock';
import type { Api } from './types';

export * from './types';

/**
 * The platform's data layer. Today every service runs on the in-browser mock;
 * as back-end modules land, their Supabase implementations replace the mock
 * ones here without any change to the screens.
 */
export const api: Api = createMockApi();
