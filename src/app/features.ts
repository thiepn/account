export const HUB_SHARING_ENABLED = import.meta.env.VITE_HUB_SHARING_ENABLED === 'v1';
export const HUB_OAUTH_ENABLED = import.meta.env.VITE_HUB_OAUTH_ENABLED === 'staged-v1';
export const FINANCE_MCP_OAUTH_ENABLED = import.meta.env.VITE_FINANCE_MCP_OAUTH_ENABLED === 'staged-v1';
export const ACCOUNT_OAUTH_ENABLED = HUB_OAUTH_ENABLED || FINANCE_MCP_OAUTH_ENABLED;
