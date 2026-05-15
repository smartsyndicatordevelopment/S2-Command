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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'targets', label: 'Targets' },
  { id: 'customers', label: 'Customers' },
  { id: 'sales', label: 'Sales & Ads' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'plan', label: 'Business Plan' },
  { id: 'salestax', label: 'Sales Tax' },
];

const TAB_COMPONENTS = {
  overview: Overview,
  financials: Financials,
  targets: Targets,
  customers: Customers,
  sales: SalesAds,
  avatar: Avatar,
  messaging: Messaging,
  plan: BusinessPlan,
  salestax: SalesTax,
};

export default function Layout({ onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
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
                activeTab === tab.id
                  ? 'bg-purple-muted text-purple'
                  : 'text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs"
        >
          <LogOut size={13} />
          <span>Sign out</span>
        </button>
      </header>

      {/* Tab content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">
          <ActiveComponent />
        </div>
      </main>
    </div>
  );
}
