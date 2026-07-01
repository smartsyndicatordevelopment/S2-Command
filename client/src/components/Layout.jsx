import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, Sun, Moon, Database, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import AnalystPanel from './AnalystPanel';
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
import GHLMcp from '../tabs/GHLMcp';
import ClickUpMcp from '../tabs/ClickUpMcp';
import FBAds from '../tabs/FBAds';
import MakeAgent from '../tabs/MakeAgent';
import DigitsAgent from '../tabs/DigitsAgent';
import Settings from '../tabs/Settings';
import CashFlow from '../tabs/CashFlow';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview Agent' },
  {
    id: 'financials-group',
    label: 'Financials',
    children: [
      { id: 'cashflow', label: 'Cash Flow' },
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
      { id: 'salestax',   label: 'Sales Tax Calculator' },
      { id: 'ghlmcp',    label: 'GHL Agent' },
      { id: 'clickupmcp', label: 'ClickUp Agent' },
      { id: 'fbads',     label: 'Facebook Ads Agent' },
      { id: 'makeagent', label: 'Make.com Agent' },
      { id: 'digitsagent', label: 'Digits Agent' },
    ],
  },
  { id: 'settings', label: 'Settings' },
];

const TAB_COMPONENTS = {
  overview:   Overview,
  financials: Financials,
  cashflow:   CashFlow,
  targets:    Targets,
  customers:  Customers,
  sales:      SalesAds,
  avatar:     Avatar,
  messaging:  Messaging,
  plan:       BusinessPlan,
  salestax:   SalesTax,
  frameworks: Frameworks,
  ghlmcp:     GHLMcp,
  clickupmcp: ClickUpMcp,
  fbads:      FBAds,
  makeagent:  MakeAgent,
  digitsagent: DigitsAgent,
  settings:   Settings,
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
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded border py-1"
          style={{ backgroundColor: 'var(--c-card)', borderColor: 'var(--c-border)' }}
        >
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

function Toggle({ checked, onChange, label }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 rounded-full transition-colors duration-200"
      style={{
        width: '28px',
        height: '16px',
        overflow: 'hidden',
        backgroundColor: checked ? '#5c3ff4' : 'rgba(255,255,255,0.12)',
      }}
      title={label}
    >
      <span
        className="absolute rounded-full bg-white transition-all duration-200"
        style={{
          top: '2px',
          left: checked ? '14px' : '2px',
          width: '12px',
          height: '12px',
        }}
      />
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-center gap-2 text-xs text-muted" title={now.toLocaleString()}>
      <span>{date}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-dim)' }}>{time}</span>
    </div>
  );
}

export default function Layout({ onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { theme, toggleTheme, isDemo, toggleDemo } = useApp();

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      {/* Top nav */}
      <header
        className="flex items-center justify-between px-6 border-b border-border flex-shrink-0"
        style={{ height: '52px' }}
      >
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

        {/* Right controls */}
        <div className="flex items-center gap-4">
          {/* Live date + time */}
          <Clock />

          <span className="h-4 w-px" style={{ backgroundColor: 'var(--c-border)' }} />

          {/* Light / Dark toggle */}
          <div className="flex items-center gap-1.5">
            <Moon size={11} className="text-muted flex-shrink-0" />
            <Toggle checked={theme === 'light'} onChange={toggleTheme} label="Toggle light/dark mode" />
            <Sun size={11} className="text-muted flex-shrink-0" />
          </div>

          {/* Live / Demo toggle */}
          <div className="flex items-center gap-1.5">
            <Database size={11} className="text-muted flex-shrink-0" />
            <Toggle checked={isDemo} onChange={toggleDemo} label="Toggle demo/live data" />
            <span className="text-xs text-muted">Demo</span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs"
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Demo mode banner */}
      {isDemo && (
        <div
          className="flex items-center justify-center gap-2 py-1 text-xs font-medium flex-shrink-0"
          style={{
            backgroundColor: 'rgba(92,63,244,0.12)',
            color: '#5c3ff4',
            borderBottom: '1px solid rgba(92,63,244,0.2)',
          }}
        >
          <Eye size={11} />
          Demo mode -- showing sample data
        </div>
      )}

      {/* Tab content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">
          <ActiveComponent />
        </div>
      </main>

      {/* Business Analyst slide-out -- always present */}
      <AnalystPanel activeTab={activeTab} />
    </div>
  );
}
