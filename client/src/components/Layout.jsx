import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
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

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  {
    id: 'financials-group',
    label: 'Financials',
    children: [
      { id: 'financials', label: 'Financials' },
      { id: 'customers', label: 'Customers' },
    ],
  },
  {
    id: 'plan-group',
    label: 'Business Plan',
    children: [
      { id: 'plan', label: 'Business Plan' },
      { id: 'targets', label: 'Targets' },
      { id: 'sales', label: 'Sales & Ads' },
      { id: 'avatar', label: 'Avatar' },
      { id: 'messaging', label: 'Messaging' },
      { id: 'frameworks', label: 'Frameworks' },
    ],
  },
  {
    id: 'tools-group',
    label: 'Tools',
    children: [
      { id: 'salestax', label: 'Sales Tax Calculator' },
    ],
  },
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
  frameworks: Frameworks,
};

function NavDropdown({ item, activeTab, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = item.children.some(c => c.id === activeTab);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          isActive
            ? 'bg-purple-muted text-purple'
            : 'text-muted hover:text-white hover:bg-white/5'
        }`}
      >
        {item.label}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded border border-border bg-bg shadow-lg py-1">
          {item.children.map(child => (
            <button
              key={child.id}
              onClick={() => { onSelect(child.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === child.id
                  ? 'text-purple bg-purple-muted'
                  : 'text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
          {NAV_ITEMS.map(item =>
            item.children ? (
              <NavDropdown
                key={item.id}
                item={item}
                activeTab={activeTab}
                onSelect={setActiveTab}
              />
            ) : (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  activeTab === item.id
                    ? 'bg-purple-muted text-purple'
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            )
          )}
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
