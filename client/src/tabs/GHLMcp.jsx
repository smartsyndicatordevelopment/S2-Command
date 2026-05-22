import McpExplorer from '../components/McpExplorer';
import { GHL_CATEGORIES } from '../data/ghlEndpoints';

export default function GHLMcp() {
  return (
    <McpExplorer
      title="GHL MCP Builder"
      subtitle="Interact with every GoHighLevel API endpoint -- API key stored securely on the server"
      configRoute="/api/ghl/config"
      proxyRoute="/api/ghl/proxy"
      apiKeyLabel="Sub-Account API Key"
      apiKeyPlaceholder="ghs_xxxxxxxxxxxx"
      configFields={[
        { key: 'locationId', label: 'Location ID', placeholder: 'Axxxxxxxxxxxxxxxxxxxxxxx' },
      ]}
      categories={GHL_CATEGORIES}
    />
  );
}
