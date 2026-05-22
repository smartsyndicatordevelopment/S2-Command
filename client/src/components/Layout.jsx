import { useState } from 'react';
import { LogOut } from 'lucide-react';
import Overview from '../tabs/Overview';
import Financials from '../tabs/Financials';
import Targets from '../tabs/Targets';
import Customers from '../tabs/Customers';
import SalesAds from '../tabs/SalesAds';
import Avatar from '../tabs/Avatar';
import Messaging from '../tabs/Messaging';
import BusinessPlan from '../tabs/BusinessPlan';
import SalesTax from '../tabs/SalesTax';
import Frameworks from '../tabs/Frameworks';
import BusinessChat from '../components/BusinessChat';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'targets', label: 'Targets' },
  { id: 'customers', label: 'Customers' },
  { id: 'plan', label: 'Business Plan' },
];

// Tools submenu items
const TOOLS_TABS = [
  { id: 'sales-tax-calculator', label: 'Sales Tax Calculator' },
  { id: 'frameworks', label: 'Frameworks' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'sales', label: 'Sales & Ads' },
];

const TAB_COMPONENTS = {
  overview: Overview,
  financials: Financials,
  targets: Targets,
  customers: Customers,
  plan: BusinessPlan,
  // Tools components
  'sales-tax-calculator': SalesTax,
  frameworks: Frameworks,
  messaging: Messaging,
  avatar: Avatar,
  sales: SalesAds,
};

export default function Layout({ onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showAnalyst, setShowAnalyst] = useState(false);

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Top nav */}
      <header className="flex items-center justify-between px-6 border-b border-border flex-shrink-0" style={{ height: '52px' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-purple-muted">
            <span className="text-purple text-xs font-bold">S2</span>
          </div>
          <span className="text-white font-semibold text-sm">Command Center</span>
        </div>

        <nav className="flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === tab.id ? 'bg-purple-muted text-purple' : 'text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {/* Tools dropdown */}
          <div className="relative">
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                toolsOpen ? 'bg-purple-muted text-purple' : 'text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Tools ▼
            </button>
            {toolsOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-bg border border-border rounded shadow-lg z-10">
                {TOOLS_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setToolsOpen(false);
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-muted hover:bg-white/5"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Analyst toggle */}
          <button
            onClick={() => setShowAnalyst(!showAnalyst)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors text-muted hover:text-white hover:bg-white/5"
          >
            Analyst {showAnalyst ? '◀' : '▶'}
          </button>

          <button onClick={handleLogout} className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs">
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </nav>
      </header>

      {/* Main content area */}
      <main className="flex flex-1 overflow-auto">
        {/* Active tab panel */}
        <div className="flex-1 p-6 max-w-screen-2xl mx-auto overflow-auto">
          <ActiveComponent />
        </div>

        {/* Collapsible Business Analyst sidebar */}
        {showAnalyst && (
          <div className="w-80 border-l border-border bg-bg overflow-auto">
            <div className="flex items-center justify-between p-2 border-b border-border">
              <p className="text-sm font-medium text-white">Business Analyst</p>
              <button onClick={() => setShowAnalyst(false)} className="text-muted hover:text-white">✕</button>
            </div>
            <div className="p-2">
              <BusinessChat />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
