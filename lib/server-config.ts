import 'server-only';
import { z } from 'zod';

export const serverConfig = z.object({
  workspacePageSize: z.coerce.number().int().min(1).max(1000).default(500),
  auditHistoryLimit: z.coerce.number().int().min(1).max(1000).default(100),
}).parse({
  workspacePageSize: process.env.WORKSPACE_PAGE_SIZE || undefined,
  auditHistoryLimit: process.env.AUDIT_HISTORY_LIMIT || undefined,
});
