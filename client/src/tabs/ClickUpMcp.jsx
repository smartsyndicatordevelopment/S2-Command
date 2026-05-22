import McpExplorer from '../components/McpExplorer';
import { CLICKUP_CATEGORIES } from '../data/clickupEndpoints';

export default function ClickUpMcp() {
  return (
    <McpExplorer
      title="ClickUp MCP Builder"
      subtitle="Interact with every ClickUp API v2 endpoint -- API key stored securely on the server"
      configRoute="/api/clickup/config"
      proxyRoute="/api/clickup/proxy"
      apiKeyLabel="Personal API Token"
      apiKeyPlaceholder="pk_xxxxxxxxxxxxxxxxxxxx"
      configFields={[
        { key: 'teamId', label: 'Workspace / Team ID', placeholder: '12345678' },
      ]}
      categories={CLICKUP_CATEGORIES}
    />
  );
}
