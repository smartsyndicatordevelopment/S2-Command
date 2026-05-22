import { useState, useEffect } from 'react';
import { 
  BookOpen, HelpCircle, FileText, ShieldAlert, Target, Award, Compass, 
  Settings, Megaphone, Cpu, Users, GraduationCap, ClipboardList, CheckCircle2, 
  Search, ArrowRight, ChevronRight, AlertTriangle, RefreshCw, Layers, Sparkles
} from 'lucide-react';
import Card from '../components/ui/Card';

// -------------------------------------------------------------
// Framework Data & Configuration
// -------------------------------------------------------------

const CATEGORIES = {
  PARENT: { label: 'Parent System', color: 'text-purple bg-purple/10 border-purple/20' },
  TACTICAL: { label: 'Tactical Execution', color: 'text-green bg-green/10 border-green/20' },
  FUNNEL: { label: 'Funnel & CRM', color: 'text-yellow bg-yellow/10 border-yellow/20' },
  COPYWRITING: { label: 'Copywriting', color: 'text-purple bg-purple/10 border-purple/20' },
  COMPLIANCE: { label: 'Compliance', color: 'text-red bg-red/10 border-red/20' },
  STRATEGY: { label: 'Planning', color: 'text-dim bg-border border-border' },
};

const FRAMEWORKS = [
  {
    id: 'smart',
    name: 'SMART Method™',
    tagline: 'Capital Raising Operating System',
    category: CATEGORIES.PARENT,
    tags: ['parent', 'strategy', 'infrastructure'],
    icon: Target,
    desc: 'Proprietary operating framework for raising capital at scale. Moves syndicators from scattered contacts into a structured investor relationship system.'
  },
  {
    id: 'crac',
    name: 'CRAC Method',
    tagline: 'Database Activation & Follow Up',
    category: CATEGORIES.TACTICAL,
    tags: ['tactical', 'activation', 'pipeline'],
    icon: Compass,
    desc: 'Tactical execution framework to consolidate data, reactivate dormant opportunities, automate follow up, and cultivate trust.'
  },
  {
    id: 'sixcs',
    name: 'Six C’s Framework',
    tagline: 'CRM & Funnel Lifecycle',
    category: CATEGORIES.FUNNEL,
    tags: ['funnel', 'crm', 'referral'],
    icon: Layers,
    desc: 'Customer journey flow mapping how an investor moves from first capture to collecting details, connecting, converting, and cultivating referrals.'
  },
  {
    id: 'sot',
    name: 'SOT Method',
    tagline: 'Execution Planning Hierarchy',
    category: CATEGORIES.STRATEGY,
    tags: ['planning', 'operations', 'tactics'],
    icon: ClipboardList,
    desc: 'Helps separate high-level direction (Strategic) from system design (Operational) and execution tasks (Tactical).'
  },
  {
    id: 'corefive',
    name: 'Core Five Foundation',
    tagline: 'High-Converting Copy Structure',
    category: CATEGORIES.COPYWRITING,
    tags: ['copywriting', 'ads', 'landing pages'],
    icon: Sparkles,
    desc: 'The default copywriting blueprint for ads and landing page structures, designed to capture attention and direct action.'
  },
  {
    id: 'sprint',
    name: 'Investor Magnet Sprint',
    tagline: 'Nurture & Attraction Campaigns',
    category: CATEGORIES.TACTICAL,
    tags: ['campaign', 'nurture', 'activation'],
    icon: BookOpen,
    desc: 'Short, focused campaign structure to attract interest, educate prospects, and drive soft commitments.'
  },
  {
    id: 'email',
    name: 'High Conversion Email Framework',
    tagline: 'Authority Building Email Flow',
    category: CATEGORIES.COPYWRITING,
    tags: ['copywriting', 'email', 'nurture'],
    icon: FileText,
    desc: 'Default structured path for marketing emails that teaches first, establishes credibility, and presents logical calls to action.'
  },
  {
    id: 'ftc',
    name: '35 FTC Triggers',
    tagline: 'Compliance & Copy Review',
    category: CATEGORIES.COMPLIANCE,
    tags: ['compliance', 'ftc', 'copy safety'],
    icon: ShieldAlert,
    desc: 'Compliance framework to scan marketing copies, ads, scripts, and claim statements to verify safety and regulatory compliance.'
  }
];

// Default answers for SMART Self-Assessment
const DEFAULT_ASSESSMENT = {
  systems: 3,
  marketing: 3,
  automation: 3,
  relationships: 3,
  training: 3,
};

export default function Frameworks() {
  const [activeId, setActiveId] = useState('blueprint');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Assessment State
  const [assessment, setAssessment] = useState(() => {
    const saved = localStorage.getItem('s2_smart_assessment');
    return saved ? JSON.parse(saved) : DEFAULT_ASSESSMENT;
  });
  
  // Copy Checker State
  const [copyText, setCopyText] = useState('');
  const [activeCheckerTab, setActiveCheckerTab] = useState('ftc');
  const [checkerChecked, setCheckerChecked] = useState({});

  useEffect(() => {
    localStorage.setItem('s2_smart_assessment', JSON.stringify(assessment));
  }, [assessment]);

  // Sidebar filtering logic
  const filteredFrameworks = FRAMEWORKS.filter(fw => {
    const query = searchQuery.toLowerCase();
    return (
      fw.name.toLowerCase().includes(query) ||
      fw.tagline.toLowerCase().includes(query) ||
      fw.desc.toLowerCase().includes(query) ||
      fw.tags.some(t => t.includes(query)) ||
      fw.category.label.toLowerCase().includes(query)
    );
  });

  const selectTab = (id) => {
    setActiveId(id);
  };

  const resetAssessment = () => {
    setAssessment(DEFAULT_ASSESSMENT);
  };

  const handleAssessmentChange = (key, val) => {
    setAssessment(prev => ({ ...prev, [key]: val }));
  };

  // Copy Checker Checkbox Toggle
  const toggleCheck = (id) => {
    setCheckerChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Checklists for copy reviewer
  const CHECKLISTS = {
    ftc: [
      { id: 'ftc_income', label: 'No unsupported income or returns claims' },
      { id: 'ftc_guarantee', label: 'No guaranteed outcomes or risk-free promises' },
      { id: 'ftc_urgency', label: 'No artificial or misleading scarcity/urgency' },
      { id: 'ftc_testimonials', label: 'No unverifiable investor testimonials' },
      { id: 'ftc_cherrypick', label: 'No cherry-picked deal histories' },
      { id: 'ftc_implied', label: 'No implied certainty or absolute returns' },
      { id: 'ftc_ease', label: 'No statements exaggerating simplicity/ease of investing' },
      { id: 'ftc_disclosure', label: 'Clear disclosure of fees, risks, and material terms' },
    ],
    corefive: [
      { id: 'c5_hook', label: 'Hook: Clear, attention-grabbing opening hook' },
      { id: 'c5_pain', label: 'Pain Point / Desire: Address specific LP frustration or goal' },
      { id: 'c5_sol', label: 'Solution: Introduce the vehicle / mechanism' },
      { id: 'c5_offer', label: 'Offer: Explicitly layout what the investor gets' },
      { id: 'c5_cta', label: 'CTA: Single, unambiguous call to action' },
      { id: 'c5_proof', label: 'Enhancer: Dynamic credibility / social proof included' },
    ],
    email: [
      { id: 'em_obs', label: 'Relatable Observation: Captivating current event or scenario' },
      { id: 'em_anchor', label: 'Credibility Anchor: Establish trust / perspective early' },
      { id: 'em_lesson', label: 'Core Lesson: Practical, educational value point' },
      { id: 'em_mech', label: 'Mechanism: Detail why this lesson works under the hood' },
      { id: 'em_insight', label: 'Practical Insight: Actionable advice for the LP' },
      { id: 'em_system', label: 'System Connection: Tie back to the Smart Syndicator platform' },
      { id: 'em_takeaway', label: 'Key Takeaway: Clear, memorable summary' },
      { id: 'em_cta', label: 'CTA: Directional next step (e.g. book a call, register)' },
    ],
  };

  // Calculate Copy Checker Progress
  const currentChecklist = CHECKLISTS[activeCheckerTab];
  const checkedCount = currentChecklist.filter(item => checkerChecked[item.id]).length;
  const progressPct = Math.round((checkedCount / currentChecklist.length) * 100) || 0;

  // SMART Score calculation
  const totalScore = Object.values(assessment).reduce((a, b) => a + b, 0);
  const scorePct = Math.round((totalScore / 25) * 100);

  const getMaturityTier = (score) => {
    if (score <= 12) return { label: 'Scattered Activity', color: 'text-red bg-red/10 border-red/20', desc: 'Your capital raising relies heavily on spreadsheets, random outreach, and manual memory. Risk of lead leakage and inconsistent pipeline flow is very high.' };
    if (score <= 19) return { label: 'Emerging System', color: 'text-yellow bg-yellow/10 border-yellow/20', desc: 'You have some foundational tools and marketing pieces, but they lack consistent automation and unified training. Pipeline flows, but with leaks.' };
    return { label: 'Systemized Capital Engine', color: 'text-green bg-green/10 border-green/20', desc: 'Excellent! Your infrastructure is structured, automated, and relationship-driven. You are positioned to scale deal funding consistently.' };
  };

  const maturity = getMaturityTier(totalScore);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
      {/* LEFT SIDEBAR: Nav and Quick Search */}
      <div className="lg:col-span-1 space-y-4">
        <Card className="p-4">
          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search frameworks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-bg border border-border rounded-md text-white placeholder-muted focus:outline-none focus:border-purple/50"
            />
          </div>

          <div className="space-y-1">
            <button
              onClick={() => selectTab('blueprint')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                activeId === 'blueprint'
                  ? 'bg-purple-muted text-purple border-l-2 border-purple'
                  : 'text-dim hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers size={14} />
              <span>Blueprint Hub</span>
            </button>

            <div className="my-2 border-t border-border/50" />
            <p className="text-[10px] uppercase font-bold text-muted px-3 mb-1.5 tracking-wider">Frameworks</p>

            {filteredFrameworks.map(fw => {
              const Icon = fw.icon;
              return (
                <button
                  key={fw.id}
                  onClick={() => selectTab(fw.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    activeId === fw.id
                      ? 'bg-purple-muted text-purple border-l-2 border-purple'
                      : 'text-dim hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={14} className={activeId === fw.id ? 'text-purple' : 'text-muted'} />
                    <span className="truncate">{fw.name}</span>
                  </div>
                  <ChevronRight size={10} className="opacity-40" />
                </button>
              );
            })}

            <div className="my-2 border-t border-border/50" />
            <p className="text-[10px] uppercase font-bold text-muted px-3 mb-1.5 tracking-wider">Interactive Tools</p>

            <button
              onClick={() => selectTab('tool_assessment')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                activeId === 'tool_assessment'
                  ? 'bg-purple-muted text-purple border-l-2 border-purple'
                  : 'text-dim hover:text-white hover:bg-white/5'
              }`}
            >
              <Award size={14} />
              <span>SMART Self-Assessment</span>
              <span className="ml-auto bg-green/10 text-green border border-green/20 px-1 py-0.5 rounded text-[9px] font-mono font-bold">
                {totalScore}/25
              </span>
            </button>

            <button
              onClick={() => selectTab('tool_checker')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-all ${
                activeId === 'tool_checker'
                  ? 'bg-purple-muted text-purple border-l-2 border-purple'
                  : 'text-dim hover:text-white hover:bg-white/5'
              }`}
            >
              <ClipboardList size={14} />
              <span>Copy Compliance Checker</span>
            </button>
          </div>
        </Card>

        {/* Small Assessment Metric Box */}
        {activeId !== 'tool_assessment' && (
          <div 
            onClick={() => selectTab('tool_assessment')}
            className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-purple/40 transition-all group"
          >
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Maturity Assessment</span>
              <Sparkles size={12} className="text-purple group-hover:scale-115 transition-transform" />
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-white truncate max-w-[150px]">{maturity.label}</p>
                <p className="text-[11px] text-muted mt-0.5">SMART Score: {totalScore} / 25</p>
              </div>
              <div className="relative w-10 h-10 flex items-center justify-center rounded-full border-2 border-border">
                <span className="text-[10px] font-bold font-mono text-purple">{scorePct}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Content Details */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* 1. BLUEPRINT HUB / OVERVIEW */}
        {activeId === 'blueprint' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-white">Frameworks Blueprint Hub</h1>
              <p className="text-xs text-muted mt-0.5">The complete architectural mapping of the Smart Syndicator methodology.</p>
            </div>

            {/* Visual Interactive Diagram */}
            <Card className="p-6 overflow-hidden">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Capital Raising Operating System Blueprint</p>
              
              <div className="relative flex flex-col items-center py-6">
                
                {/* Central Parent Node */}
                <div 
                  onClick={() => selectTab('smart')}
                  className="relative z-10 group cursor-pointer bg-card border-2 border-purple hover:border-purple-hover p-4 rounded-xl shadow-xl shadow-purple/5 max-w-sm text-center transition-all transform hover:-translate-y-0.5"
                >
                  <span className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 text-[9px] font-extrabold uppercase px-2 py-0.5 bg-purple text-white rounded-full tracking-widest">
                    Parent Framework
                  </span>
                  <div className="flex justify-center mb-1 text-purple">
                    <Target size={24} />
                  </div>
                  <h3 className="text-md font-bold text-white group-hover:text-purple transition-colors">SMART Method™</h3>
                  <p className="text-xs text-dim mt-1">Five core components designed to raise investor capital at scale systematically.</p>
                </div>

                {/* Connecting Lines & Grid Sub-components */}
                <div className="w-full max-w-4xl grid grid-cols-5 gap-3 mt-12 relative">
                  
                  {/* Absolute backgrounds/decorations for connectors */}
                  <div className="absolute inset-x-10 top-0 h-0.5 bg-gradient-to-r from-purple/20 via-purple to-purple/20 -translate-y-6 z-0" />
                  
                  {/* S - Systems */}
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-0.5 bg-purple/40 mb-1" />
                    <div className="w-full bg-card/60 border border-border hover:border-purple/40 rounded-lg p-3 text-center transition-all cursor-pointer group" onClick={() => selectTab('smart')}>
                      <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center mx-auto text-purple text-xs font-bold font-mono group-hover:bg-purple group-hover:text-white transition-colors">S</div>
                      <p className="text-xs font-semibold text-white mt-1.5">Systems</p>
                      <p className="text-[10px] text-muted mt-1">Infrastructure</p>
                    </div>
                    {/* Children */}
                    <div className="mt-4 flex flex-col gap-2 w-full">
                      <div 
                        onClick={() => selectTab('crac')}
                        className="bg-card/30 border border-border/60 hover:border-green/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">CRAC Method</p>
                        <span className="text-[8px] bg-green/10 text-green px-1 py-0.5 rounded font-mono">Consolidate</span>
                      </div>
                      <div 
                        onClick={() => selectTab('sixcs')}
                        className="bg-card/30 border border-border/60 hover:border-yellow/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Six C's</p>
                        <span className="text-[8px] bg-yellow/10 text-yellow px-1 py-0.5 rounded font-mono">Collect</span>
                      </div>
                    </div>
                  </div>

                  {/* M - Marketing */}
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-0.5 bg-purple/40 mb-1" />
                    <div className="w-full bg-card/60 border border-border hover:border-purple/40 rounded-lg p-3 text-center transition-all cursor-pointer group" onClick={() => selectTab('smart')}>
                      <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center mx-auto text-purple text-xs font-bold font-mono group-hover:bg-purple group-hover:text-white transition-colors">M</div>
                      <p className="text-xs font-semibold text-white mt-1.5">Marketing</p>
                      <p className="text-[10px] text-muted mt-1">Attention</p>
                    </div>
                    {/* Children */}
                    <div className="mt-4 flex flex-col gap-2 w-full">
                      <div 
                        onClick={() => selectTab('corefive')}
                        className="bg-card/30 border border-border/60 hover:border-purple/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Core Five</p>
                        <span className="text-[8px] bg-purple/15 text-purple px-1 py-0.5 rounded font-mono">Structure</span>
                      </div>
                      <div 
                        onClick={() => selectTab('sprint')}
                        className="bg-card/30 border border-border/60 hover:border-green/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Magnet Sprint</p>
                        <span className="text-[8px] bg-green/10 text-green px-1 py-0.5 rounded font-mono">Campaign</span>
                      </div>
                      <div 
                        onClick={() => selectTab('email')}
                        className="bg-card/30 border border-border/60 hover:border-purple/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Email Flow</p>
                        <span className="text-[8px] bg-purple/15 text-purple px-1 py-0.5 rounded font-mono">Nurture</span>
                      </div>
                    </div>
                  </div>

                  {/* A - Automation */}
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-0.5 bg-purple/40 mb-1" />
                    <div className="w-full bg-card/60 border border-border hover:border-purple/40 rounded-lg p-3 text-center transition-all cursor-pointer group" onClick={() => selectTab('smart')}>
                      <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center mx-auto text-purple text-xs font-bold font-mono group-hover:bg-purple group-hover:text-white transition-colors">A</div>
                      <p className="text-xs font-semibold text-white mt-1.5">Automation</p>
                      <p className="text-[10px] text-muted mt-1">Consistency</p>
                    </div>
                    {/* Children */}
                    <div className="mt-4 flex flex-col gap-2 w-full">
                      <div 
                        onClick={() => selectTab('crac')}
                        className="bg-card/30 border border-border/60 hover:border-green/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">CRAC Method</p>
                        <span className="text-[8px] bg-green/10 text-green px-1 py-0.5 rounded font-mono">Automate</span>
                      </div>
                      <div 
                        onClick={() => selectTab('sixcs')}
                        className="bg-card/30 border border-border/60 hover:border-yellow/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Six C's</p>
                        <span className="text-[8px] bg-yellow/10 text-yellow px-1 py-0.5 rounded font-mono">Connect</span>
                      </div>
                    </div>
                  </div>

                  {/* R - Relationships */}
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-0.5 bg-purple/40 mb-1" />
                    <div className="w-full bg-card/60 border border-border hover:border-purple/40 rounded-lg p-3 text-center transition-all cursor-pointer group" onClick={() => selectTab('smart')}>
                      <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center mx-auto text-purple text-xs font-bold font-mono group-hover:bg-purple group-hover:text-white transition-colors">R</div>
                      <p className="text-xs font-semibold text-white mt-1.5">Relationships</p>
                      <p className="text-[10px] text-muted mt-1">Trust</p>
                    </div>
                    {/* Children */}
                    <div className="mt-4 flex flex-col gap-2 w-full">
                      <div 
                        onClick={() => selectTab('crac')}
                        className="bg-card/30 border border-border/60 hover:border-green/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">CRAC Method</p>
                        <span className="text-[8px] bg-green/10 text-green px-1 py-0.5 rounded font-mono">Cultivate</span>
                      </div>
                      <div 
                        onClick={() => selectTab('sprint')}
                        className="bg-card/30 border border-border/60 hover:border-green/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">Magnet Sprint</p>
                        <span className="text-[8px] bg-green/10 text-green px-1 py-0.5 rounded font-mono">Education</span>
                      </div>
                    </div>
                  </div>

                  {/* T - Training */}
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-0.5 bg-purple/40 mb-1" />
                    <div className="w-full bg-card/60 border border-border hover:border-purple/40 rounded-lg p-3 text-center transition-all cursor-pointer group" onClick={() => selectTab('smart')}>
                      <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center mx-auto text-purple text-xs font-bold font-mono group-hover:bg-purple group-hover:text-white transition-colors">T</div>
                      <p className="text-xs font-semibold text-white mt-1.5">Training</p>
                      <p className="text-[10px] text-muted mt-1">Competence</p>
                    </div>
                    {/* Children */}
                    <div className="mt-4 flex flex-col gap-2 w-full">
                      <div 
                        onClick={() => selectTab('sot')}
                        className="bg-card/30 border border-border/60 hover:border-dim/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">SOT Method</p>
                        <span className="text-[8px] bg-border text-muted px-1 py-0.5 rounded font-mono">Execution</span>
                      </div>
                      <div 
                        onClick={() => selectTab('ftc')}
                        className="bg-card/30 border border-border/60 hover:border-red/40 p-2 rounded text-center cursor-pointer transition-all"
                      >
                        <p className="text-[10px] font-semibold text-dim">35 FTC Triggers</p>
                        <span className="text-[8px] bg-red/10 text-red px-1 py-0.5 rounded font-mono">Compliance</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </Card>

            {/* Quick Introduction Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">SMART Method™ (Parent)</h3>
                    <span className="text-[9px] px-2 py-0.5 rounded-full border border-purple/20 bg-purple/10 text-purple font-mono font-bold">OPERATING SYSTEM</span>
                  </div>
                  <p className="text-xs text-dim leading-relaxed mb-4">
                    The parent operating framework. It structures a syndicator's entire capital raising system around five foundational pillars: Systems, Marketing, Automation, Relationships, and Training.
                  </p>
                </div>
                <button 
                  onClick={() => selectTab('smart')} 
                  className="flex items-center gap-1.5 text-xs text-purple hover:text-purple-hover font-semibold transition-colors mt-2"
                >
                  <span>Explore SMART Method</span>
                  <ArrowRight size={12} />
                </button>
              </Card>

              <Card className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">CRAC Method (Tactical)</h3>
                    <span className="text-[9px] px-2 py-0.5 rounded-full border border-green/20 bg-green/10 text-green font-mono font-bold">TACTICAL EXECUTION</span>
                  </div>
                  <p className="text-xs text-dim leading-relaxed mb-4">
                    The execution blueprint to turn offline/scattered records into capital results. Consolidate your database, Reactivate dormant contacts, Automate notifications/follow-up, and Cultivate relationships over time.
                  </p>
                </div>
                <button 
                  onClick={() => selectTab('crac')} 
                  className="flex items-center gap-1.5 text-xs text-green hover:text-green-hover font-semibold transition-colors mt-2"
                >
                  <span>Explore CRAC Method</span>
                  <ArrowRight size={12} />
                </button>
              </Card>
            </div>
            
            {/* Callouts for Interactive Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                onClick={() => selectTab('tool_assessment')}
                className="bg-card hover:border-purple/40 border border-border p-5 rounded-lg cursor-pointer transition-all flex items-start gap-4"
              >
                <div className="p-3 bg-purple-muted text-purple rounded-lg">
                  <Award size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">SMART Maturity Self-Assessment</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Evaluate your infrastructure across the 5 pillars. Identify leaks in your current capital-raising pipelines and receive targeted improvement checklists.
                  </p>
                </div>
              </div>

              <div 
                onClick={() => selectTab('tool_checker')}
                className="bg-card hover:border-purple/40 border border-border p-5 rounded-lg cursor-pointer transition-all flex items-start gap-4"
              >
                <div className="p-3 bg-purple-muted text-purple rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Ad & Email Copy Reviewer</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Paste your active ad copies, scripts, or email drafts to verify alignment with the Core Five, Educational Email structure, and 35 FTC Triggers compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. SMART METHOD™ VIEW */}
        {activeId === 'smart' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.PARENT.color} font-mono font-bold`}>
                    PARENT FRAMEWORK
                  </span>
                  <h1 className="text-lg font-semibold text-white">SMART Method™</h1>
                </div>
                <p className="text-xs text-muted mt-0.5">Proprietary capital raising operating framework for scaling real estate syndications.</p>
              </div>
              <button 
                onClick={() => selectTab('tool_assessment')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple text-white text-xs font-semibold hover:bg-purple-hover transition-colors"
              >
                <Award size={13} />
                <span>Test your SMART score</span>
              </button>
            </div>

            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Method Summary</p>
              <p className="text-sm text-dim leading-relaxed">
                The **SMART Method™** governs how syndicators move from scattered contacts, inconsistent follow up, and random capital raising activity into a structured investor acquisition and relationship system.
              </p>
            </Card>

            {/* Interactive Grid explaining S, M, A, R, T */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                { letter: 'S', title: 'Systems', desc: 'Build the infrastructure that organizes investor activity', color: 'border-purple/30 text-purple' },
                { letter: 'M', title: 'Marketing', desc: 'Generate attention, education, and investor interest', color: 'border-green/30 text-green' },
                { letter: 'A', title: 'Automation', desc: 'Create consistent follow up and reduce leakage', color: 'border-yellow/30 text-yellow' },
                { letter: 'R', title: 'Relationships', desc: 'Build trust and move investors toward commitment', color: 'border-purple/30 text-purple' },
                { letter: 'T', title: 'Training', desc: 'Improve execution through playbooks, templates, & guidance', color: 'border-white/30 text-white' },
              ].map(item => (
                <div key={item.letter} className="bg-card border border-border hover:border-purple/40 p-4 rounded-lg text-center transition-all">
                  <div className="w-10 h-10 rounded-full border border-border bg-bg flex items-center justify-center mx-auto text-lg font-extrabold font-mono mb-2">
                    <span className={item.color}>{item.letter}</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">{item.title}</h4>
                  <p className="text-[10px] text-muted mt-1 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Deep Dives */}
            <div className="space-y-4">
              
              {/* S: Systems details */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded bg-purple/10 text-purple flex items-center justify-center font-bold text-xs font-mono">S</span>
                  <h3 className="text-sm font-semibold text-white">Systems: The Infrastructure Foundation</h3>
                </div>
                <p className="text-xs text-dim leading-relaxed mb-4">
                  Systems are the foundational base. This includes CRM dashboards, investor databases, pipeline tag trees, calendar configurations, task monitors, and investor pipeline stages. 
                  Without this layer, follow-ups sit in gmail archives or user memory.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="pb-2 text-muted font-medium pr-4">Operational Question</th>
                        <th className="pb-2 text-muted font-medium">Systemic Answer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {[
                        { q: 'Where do new leads go?', a: 'Directly into the CRM system' },
                        { q: 'How are investors categorized?', a: 'By active tags (e.g. source, preference, capability)' },
                        { q: 'Who needs immediate follow-up?', a: 'Pipeline statuses and tasks automatically highlight them' },
                        { q: 'What stage is each investor in?', a: 'Pipelines: Lead, Warm, Booked, Qualified, Committed, Funded' }
                      ].map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-4 text-dim">{item.q}</td>
                          <td className="py-2 text-white font-medium">{item.a}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* M: Marketing details */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded bg-green/10 text-green flex items-center justify-center font-bold text-xs font-mono">M</span>
                  <h3 className="text-sm font-semibold text-white">Marketing: The Attention Engine</h3>
                </div>
                <p className="text-xs text-dim leading-relaxed mb-4">
                  Marketing structures the path from cold awareness to an active conversation. This includes funnel landing pages, educational webinars, lead magnets, social media nurture schedules, and email marketing.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="pb-2 text-muted font-medium pr-4">Marketing Stage</th>
                        <th className="pb-2 text-muted font-medium">Action Objective</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {[
                        { s: 'Awareness', o: 'How does the investor first discover our brand?' },
                        { s: 'Education', o: 'How do they learn what our syndication model is?' },
                        { s: 'Trust', o: 'How do they verify sponsor credibility and track record?' },
                        { s: 'Intent', o: 'How do they signal specific asset or fund interest?' },
                        { s: 'Conversion', o: 'How do they request deal documents or book a call?' }
                      ].map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-4 text-green font-semibold">{item.s}</td>
                          <td className="py-2 text-white">{item.o}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* A & R & T row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border border-border p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-yellow/10 text-yellow flex items-center justify-center font-bold text-xs font-mono">A</span>
                    <h4 className="text-xs font-semibold text-white">Automation: Consistency</h4>
                  </div>
                  <p className="text-[11px] text-dim leading-relaxed">
                    Prevents pipeline leakage when operators get busy. Triggers welcome emails, logs source tracking, sends SMS call reminders, and updates CRM deal cards immediately based on investor actions.
                  </p>
                  <div className="text-[10px] border-t border-border/60 pt-2 text-muted font-semibold italic">
                    "Every meaningful investor action should trigger the next logical step."
                  </div>
                </div>

                <div className="bg-card border border-border p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-purple/10 text-purple flex items-center justify-center font-bold text-xs font-mono">R</span>
                    <h4 className="text-xs font-semibold text-white">Relationships: Trust</h4>
                  </div>
                  <p className="text-[11px] text-dim leading-relaxed">
                    Where actual capital moves. Automations filter attention so the sponsor can focus human time on key phone calls, face-to-face events, webinars, and answering investor questions.
                  </p>
                  <div className="text-[10px] border-t border-border/60 pt-2 text-muted">
                    Prioritizes: Warm leads, readiness levels, soft commitments, and event invites.
                  </div>
                </div>

                <div className="bg-card border border-border p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-white/10 text-white flex items-center justify-center font-bold text-xs font-mono">T</span>
                    <h4 className="text-xs font-semibold text-white">Training: Competence</h4>
                  </div>
                  <p className="text-[11px] text-dim leading-relaxed">
                    Prevents CRM software from becoming shelfware. Equips teams with templates, copywriting SOPs, office hour walkthroughs, follow-up processes, and compliance checklists.
                  </p>
                  <div className="text-[10px] border-t border-border/60 pt-2 text-muted">
                    Fixes: What to email, follow-up script confusion, compliance worries.
                  </div>
                </div>
              </div>
            </div>

            <Card className="p-5 bg-purple-muted/10 border-purple/20">
              <p className="text-xs font-bold text-purple uppercase tracking-wider mb-2">Market Facing Pitch</p>
              <p className="text-xs text-dim italic leading-relaxed">
                "Smart Syndicator helps syndicators stop raising capital from memory, referrals, and scattered spreadsheets, and start building a structured system for attracting, nurturing, and converting investors. It is a capital raising operating system, not just a CRM."
              </p>
            </Card>
          </div>
        )}

        {/* 3. CRAC METHOD VIEW */}
        {activeId === 'crac' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.TACTICAL.color} font-mono font-bold`}>
                  TACTICAL EXECUTION
                </span>
                <h1 className="text-lg font-semibold text-white">CRAC Method</h1>
              </div>
              <p className="text-xs text-muted mt-0.5">The tactical execution blueprint for activating contacts and driving deal commitments.</p>
            </div>

            {/* Flow representation */}
            <div className="bg-card border border-border p-6 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                {[
                  { id: 'C', step: 'Consolidate', text: 'Merge scattered lists into one CRM', badgeColor: 'bg-purple/10 text-purple border-purple/20' },
                  { id: 'R', step: 'Reactivate', text: 'Wake up old and neglected leads', badgeColor: 'bg-green/10 text-green border-green/20' },
                  { id: 'A', step: 'Automate', text: 'Build systemized follow up flows', badgeColor: 'bg-yellow/10 text-yellow border-yellow/20' },
                  { id: 'C', step: 'Cultivate', text: 'Build long-term relationship trust', badgeColor: 'bg-purple/15 text-purple border-purple/25' },
                ].map((item, idx) => (
                  <div key={idx} className="relative flex flex-col items-center text-center p-3 bg-bg border border-border rounded-lg">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-sm font-mono ${item.badgeColor} mb-2`}>
                      {item.id}
                    </div>
                    <h3 className="text-xs font-bold text-white">{item.step}</h3>
                    <p className="text-[10px] text-muted mt-1 leading-snug">{item.text}</p>
                    {idx < 3 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10 text-muted">
                        <ArrowRight size={14} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tabular Deep Dive of the steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-purple/10 text-purple flex items-center justify-center font-mono">C</span>
                    <span>Consolidate the Base</span>
                  </h4>
                </div>
                <p className="text-xs text-dim leading-relaxed">
                  Bring scattered investor data, phone lists, Gmail records, past webinar registration CSVs, and event lists into a single unified CRM.
                </p>
                <div className="bg-bg border border-border rounded p-2.5">
                  <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Consolidated Sources:</p>
                  <div className="flex flex-wrap gap-1">
                    {['Spreadsheets', 'Phone Contacts', 'Gmail Lists', 'Webinars', 'Facebook Leads', 'Referral Logs'].map(t => (
                      <span key={t} className="text-[9px] bg-border px-1.5 py-0.5 rounded text-muted font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-green/10 text-green flex items-center justify-center font-mono">R</span>
                    <span>Reactivate Dormant Leads</span>
                  </h4>
                </div>
                <p className="text-xs text-dim leading-relaxed">
                  Dormant opportunities sit in every list. Wake up prior investors and old leads via check-in content, educational market updates, and soft commitment interest checks.
                </p>
                <div className="bg-bg border border-border rounded p-2.5">
                  <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Reactivation Campaigns:</p>
                  <div className="flex flex-wrap gap-1">
                    {['Check-in Emails', 'Soft Interest Polls', 'Live Webinar Invites', 'Deal Ready Surveys'].map(t => (
                      <span key={t} className="text-[9px] bg-border px-1.5 py-0.5 rounded text-muted font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-yellow/10 text-yellow flex items-center justify-center font-mono">A</span>
                    <span>Automate the Follow-Up</span>
                  </h4>
                </div>
                <p className="text-xs text-dim leading-relaxed">
                  Configure tags, tracking pipelines, email/SMS nurture workflow templates, calendar sync triggers, and missed-call responses to guarantee no prospect falls through the cracks.
                </p>
                <div className="bg-bg border border-border rounded p-2.5">
                  <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Automation Engines:</p>
                  <div className="flex flex-wrap gap-1">
                    {['Welcome Sequences', 'SMS Booking Reminders', 'Click Triggers', 'Missed Call Textback'].map(t => (
                      <span key={t} className="text-[9px] bg-border px-1.5 py-0.5 rounded text-muted font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-purple/15 text-purple flex items-center justify-center font-mono">C</span>
                    <span>Cultivate Relationships</span>
                  </h4>
                </div>
                <p className="text-xs text-dim leading-relaxed">
                  Most LPs take months to commit capital. Maintain persistent, value-rich exposure through newsletters, CPA track-record reports, educational webinars, and direct calls.
                </p>
                <div className="bg-bg border border-border rounded p-2.5">
                  <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Cultivation Elements:</p>
                  <div className="flex flex-wrap gap-1">
                    {['Monthly Reports', 'Quarterly Calls', 'Educational Content', 'Track Record Showcases'].map(t => (
                      <span key={t} className="text-[9px] bg-border px-1.5 py-0.5 rounded text-muted font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-4 bg-green-muted/10 border-green/20 text-center">
              <p className="text-xs text-green font-bold uppercase tracking-wider mb-1">Clean Positioning</p>
              <p className="text-xs text-dim italic">
                "Consolidate the database. Reactivate the opportunities. Automate the follow up. Cultivate the relationships."
              </p>
            </Card>
          </div>
        )}

        {/* 4. SIX CS VIEW */}
        {activeId === 'sixcs' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.FUNNEL.color} font-mono font-bold`}>
                  FUNNEL & CRM LIFECYCLE
                </span>
                <h1 className="text-lg font-semibold text-white">Six C’s Framework</h1>
              </div>
              <p className="text-xs text-muted mt-0.5">Explains how an investor flows from first attention into value delivery and referral cycles.</p>
            </div>

            {/* Circle or Cycle Diagram */}
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">The Relationship Loop</p>
              
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { step: '1. Capture', desc: 'Bring leads in', sub: 'Ads, landing pages', border: 'border-purple/35' },
                  { step: '2. Collect', desc: 'Gather information', sub: 'Tags, preferences', border: 'border-green/35' },
                  { step: '3. Connect', desc: 'Follow up', sub: 'SMS, emails, calls', border: 'border-yellow/35' },
                  { step: '4. Convert', desc: 'Drive commitments', sub: 'Soft commits, calls', border: 'border-purple/35' },
                  { step: '5. Create', desc: 'Deliver value', sub: 'CRM setups, deals', border: 'border-white/35' },
                  { step: '6. Cultivate', desc: 'Generate referrals', sub: 'Referrals, updates', border: 'border-green/35' },
                ].map((item, idx) => (
                  <div key={idx} className={`bg-bg border ${item.border} rounded-lg p-3 text-center flex flex-col justify-between min-h-[110px]`}>
                    <div>
                      <p className="text-xs font-bold text-white">{item.step}</p>
                      <p className="text-[10px] text-dim mt-1">{item.desc}</p>
                    </div>
                    <p className="text-[9px] text-muted italic mt-2">{item.sub}</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 border-t border-border pt-4 flex items-center justify-between text-xs text-muted">
                <span>🔄 The <strong>Cultivate</strong> stage closes the loop, feeding new referrals directly back into <strong>Capture</strong>.</span>
                <span className="font-semibold text-white">Funnel Loop Model</span>
              </div>
            </Card>

            {/* Detail Table */}
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border text-muted uppercase tracking-wider text-[10px]">
                      <th className="pb-2.5 font-bold">Step</th>
                      <th className="pb-2.5 font-bold">Focus Area</th>
                      <th className="pb-2.5 font-bold">Execution Mechanisms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { step: 'Capture', meaning: 'Bring leads into the system', func: 'Facebook/LinkedIn ads, webinar registrations, organic content, opt-in forms' },
                      { step: 'Collect', meaning: 'Organize details', func: 'Source details, accredited status, investment capacity tags, history notes' },
                      { step: 'Connect', meaning: 'Create conversations', func: 'Nurture emails, automated calendar bookings, direct calls, SMS touchpoints' },
                      { step: 'Convert', meaning: 'Drive action', func: 'Booked strategy calls, signed subscription docs, funded escrow accounts' },
                      { step: 'Create', meaning: 'Fulfill promises', func: 'Onboarding setups, clean investor portal experience, clear quarterly reporting' },
                      { step: 'Cultivate', meaning: 'Ask for referrals', func: 'Review meetings, LP VIP masterminds, custom email checkins feeding back to Capture' }
                    ].map((item, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 font-semibold text-white">{item.step}</td>
                        <td className="py-3 text-dim">{item.meaning}</td>
                        <td className="py-3 text-muted">{item.func}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* 5. SOT METHOD VIEW */}
        {activeId === 'sot' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.STRATEGY.color} font-mono font-bold`}>
                  PLANNING HIERARCHY
                </span>
                <h1 className="text-lg font-semibold text-white">SOT Method</h1>
              </div>
              <p className="text-xs text-muted mt-0.5">Execution planning framework separating strategy from operational pipelines and daily tasks.</p>
            </div>

            {/* Pyramid visual hierarchy */}
            <div className="space-y-3">
              {[
                { 
                  level: 'Strategic', 
                  desc: 'Big picture direction, goals, and market positioning', 
                  examples: 'Target investor avatar, deal message hierarchy, ARR goals', 
                  color: 'bg-purple/20 border-purple/35 text-purple',
                  tier: 'TIER 1 - WHY & WHO'
                },
                { 
                  level: 'Operational', 
                  desc: 'System flow designs, automation mapping, and database rules', 
                  examples: 'Sales funnels, GHL tags, CRM pipeline structures, follow up routes', 
                  color: 'bg-green/10 border-green/20 text-green',
                  tier: 'TIER 2 - WHAT & HOW'
                },
                { 
                  level: 'Tactical', 
                  desc: 'Hands-on configuration work, assets building, and task lists', 
                  examples: 'Write email text, set calendar link, upload spreadsheet, launch Meta ad', 
                  color: 'bg-yellow/10 border-yellow/20 text-yellow',
                  tier: 'TIER 3 - WHEN & DO'
                }
              ].map((tier, idx) => (
                <div key={idx} className={`border rounded-lg p-5 flex flex-col md:flex-row justify-between gap-4 bg-card ${tier.color.split(' ')[0]} ${tier.color.split(' ')[1]}`}>
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-extrabold uppercase tracking-wider opacity-60">{tier.tier}</span>
                    <h3 className="text-md font-bold text-white">{tier.level}</h3>
                    <p className="text-xs text-dim leading-relaxed">{tier.desc}</p>
                  </div>
                  <div className="md:w-1/3 bg-bg/50 border border-border/40 rounded p-3 text-xs flex flex-col justify-center">
                    <p className="text-[9px] uppercase font-bold text-muted mb-1">Examples:</p>
                    <p className="text-muted leading-relaxed font-mono text-[10px]">{tier.examples}</p>
                  </div>
                </div>
              ))}
            </div>

            <Card className="p-4 text-center">
              <p className="text-xs text-muted leading-relaxed">
                👉 The <strong>SOT Method</strong> prevents operators from confusing basic tactical tasks (e.g. posting an ad) with high-level direction (e.g. positioning the offer).
              </p>
            </Card>
          </div>
        )}

        {/* 6. CORE FIVE FOUNDATION VIEW */}
        {activeId === 'corefive' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.COPYWRITING.color} font-mono font-bold`}>
                    COPYWRITING BLUEPRINT
                  </span>
                  <h1 className="text-lg font-semibold text-white">Core Five Foundation</h1>
                </div>
                <p className="text-xs text-muted mt-0.5">The structural standard for Facebook Ads, landing pages, and pitch texts.</p>
              </div>
              <button 
                onClick={() => { selectTab('tool_checker'); setActiveCheckerTab('corefive'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple text-white text-xs font-semibold hover:bg-purple-hover transition-colors"
              >
                <ClipboardList size={13} />
                <span>Test in Copy Reviewer</span>
              </button>
            </div>

            {/* Structure Flow blocks */}
            <div className="space-y-2">
              {[
                { step: '1. The Hook', purp: 'Grab immediate attention', detail: 'Stop scrolling behavior. Address a critical headline focus or major real estate opportunity.' },
                { step: '2. Pain Point / Desire', purp: 'Build personal relevance', detail: 'Name the specific frustration the LP has (e.g. low stock returns, high tax burdens) or outcomes they want.' },
                { step: '3. Solution', purp: 'Introduce the mechanism', detail: 'Show the syndication structure or asset type as the logical answer to their dilemma.' },
                { step: '4. Offer', purp: 'Explain what they receive', detail: 'Detail what is included: access to deal documents, webinar links, PDF checklists, or fund structures.' },
                { step: '5. Clear Call-To-Action (CTA)', purp: 'Command specific next step', detail: 'Tell them exactly what to do (e.g. "Click below to secure your spot", "Book a 15-minute qualification call").' }
              ].map((item, idx) => (
                <div key={idx} className="bg-card border border-border p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="md:w-1/4">
                    <p className="text-xs font-bold text-white">{item.step}</p>
                    <span className="text-[10px] text-purple bg-purple/10 border border-purple/20 px-2 py-0.5 rounded-full font-semibold inline-block mt-1">
                      {item.purp}
                    </span>
                  </div>
                  <div className="flex-1 text-xs text-dim leading-relaxed">
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>

            {/* Optional Enhancers Pills */}
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Optional Copy Enhancers</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Social Proof (Track Record)', 'Scarcity / Urgency', 'Result-Based Guarantees', 
                  'Mechanism Deep-dive', 'Risk Reversals', 'Credibility Anchors', 'Specific Audience Callout'
                ].map(p => (
                  <span key={p} className="text-[10px] bg-bg border border-border px-2.5 py-1 rounded text-dim font-medium hover:border-purple/35 transition-colors">
                    ✨ {p}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* 7. INVESTOR MAGNET SPRINT VIEW */}
        {activeId === 'sprint' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.TACTICAL.color} font-mono font-bold`}>
                  CAMPAIGN FRAMEWORK
                </span>
                <h1 className="text-lg font-semibold text-white">Investor Magnet Sprint</h1>
              </div>
              <p className="text-xs text-muted mt-0.5">Short marketing campaign structure designed to generate investor attention and calendar bookings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Campaign Structure details */}
              <Card className="p-5 space-y-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted">Sprint Architecture</p>
                <p className="text-xs text-dim leading-relaxed">
                  Sprints are focused campaigns targeted at a specific segment of the investor pipeline. They deliver rapid educational touchpoints and drive a singular call to action.
                </p>
                
                <ul className="space-y-2">
                  {[
                    'Identify a clear target audience (e.g. passive dentists)',
                    'Frame a specific investor pain/desire (e.g. reducing taxes)',
                    'Package a focused campaign promise (e.g. 5-day educational course)',
                    'Sequence authority-building email/text touchpoints',
                    'Deliver a simple call to action (e.g. webinar signup, call)',
                    'Track activity tagging and results inside the S2 CRM'
                  ].map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-dim">
                      <CheckCircle2 size={13} className="text-green mt-0.5 flex-shrink-0" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Connection to CRAC */}
              <Card className="p-5 space-y-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted">Mapping to the CRAC Method</p>
                
                <div className="space-y-3">
                  {[
                    { c: 'Consolidate', text: 'Define the target list segment or import new contacts for the sprint' },
                    { c: 'Reactivate', text: 'Wake up old contacts with immediate, high-value, educational offers' },
                    { c: 'Automate', text: 'Deploy campaign sequences, tag tracking, and calendar reminders' },
                    { c: 'Cultivate', text: 'Deliver trust-building education modules over the campaign timeline' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-start text-xs border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                      <span className="text-[10px] font-mono font-bold text-green bg-green/10 px-2 py-0.5 rounded border border-green/20 flex-shrink-0">
                        {item.c}
                      </span>
                      <p className="text-dim">{item.text}</p>
                    </div>
                  ))}
                </div>
              </Card>

            </div>

            <Card className="p-4 bg-bg border border-border">
              <p className="text-xs text-muted leading-relaxed">
                🚀 <strong>Primary Sprint Use Cases:</strong> Database reactivation runs, live webinar promotions, event invite campaigns, or new deal soft-commitment checks.
              </p>
            </Card>
          </div>
        )}

        {/* 8. HIGH CONVERSION EMAIL FRAMEWORK VIEW */}
        {activeId === 'email' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.COPYWRITING.color} font-mono font-bold`}>
                    EMAIL COPYWRITING
                  </span>
                  <h1 className="text-lg font-semibold text-white">Educational Email Framework</h1>
                </div>
                <p className="text-xs text-muted mt-0.5">The structural formula for authority building marketing and nurture emails.</p>
              </div>
              <button 
                onClick={() => { selectTab('tool_checker'); setActiveCheckerTab('email'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple text-white text-xs font-semibold hover:bg-purple-hover transition-colors"
              >
                <ClipboardList size={13} />
                <span>Test in Copy Reviewer</span>
              </button>
            </div>

            {/* Layout side by side: list of elements + Email Mockup example */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              
              {/* Elements List */}
              <div className="xl:col-span-2 space-y-2">
                {[
                  { step: '1. Observation', p: 'Start with something relatable' },
                  { step: '2. Credibility Anchor', p: 'Why the reader should trust you' },
                  { step: '3. Core Lesson', p: 'Teach the main valuable idea' },
                  { step: '4. Mechanism', p: 'Explain the backend logic' },
                  { step: '5. Practical Insight', p: 'Make it usable immediately' },
                  { step: '6. System Connection', p: 'Tie to broader S2 capabilities' },
                  { step: '7. Key Takeaway', p: 'Simple, memorable summary' },
                  { step: '8. Call to Action', p: 'Provide the logical next step' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-card border border-border p-2.5 rounded text-xs flex gap-2 items-center">
                    <span className="w-5 h-5 rounded-full bg-purple/10 text-purple flex items-center justify-center font-bold text-[10px] font-mono flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{item.step}</p>
                      <p className="text-[10px] text-muted">{item.p}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Email Mockup */}
              <div className="xl:col-span-3">
                <Card className="p-4 bg-bg border border-border flex flex-col h-full">
                  <div className="flex items-center gap-2 border-b border-border pb-3 mb-3 text-xs text-muted">
                    <div className="w-3 h-3 rounded-full bg-red" />
                    <div className="w-3 h-3 rounded-full bg-yellow" />
                    <div className="w-3 h-3 rounded-full bg-green" />
                    <span className="ml-2 font-mono text-[10px] text-dim">Subject: Why spreadsheets leak 15% of deal commitments...</span>
                  </div>

                  <div className="space-y-4 text-xs font-serif leading-relaxed text-dim overflow-y-auto max-h-[380px] p-2 bg-card rounded border border-border/50">
                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">1. RELATABLE OBSERVATION</p>
                      <p>Hey Brandon, I was looking through a sponsor's pipeline yesterday and realized they had three different commitments sitting in email draft folders. One check never showed up because the wire instructions got lost in a spam folder.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">2. CREDIBILITY ANCHOR</p>
                      <p>Having helped real estate sponsors raise over $50M in equity across 40 deals, we see this exact leakage point constantly.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">3. CORE LESSON</p>
                      <p>The lesson is simple: if your deal management depends on spreadsheets, you aren't managing relationships; you are relying on luck. Scattered tracking leads to investor friction.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">4. MECHANISM</p>
                      <p>When an LP commits, their excitement declines by roughly 10% every day they don't receive follow-up. An organized tag and pipeline tracker ensures speed of fulfillment.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">5. PRACTICAL INSIGHT</p>
                      <p>Action step: Set up a single "Escrow Checked" folder in Gmail today, and do not let an email sit there for more than 4 hours without moving the CRM pipeline status card.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">6. SYSTEM PERSPECTIVE</p>
                      <p>This is why we built the automated pipeline board inside Smart Syndicator, moving cards automatically when an investor signs docs.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">7. KEY TAKEAWAY</p>
                      <p>Speed to escrow is the single biggest variable in closing out your next asset round successfully.</p>
                    </div>

                    <div>
                      <p className="text-purple bg-purple/10 font-sans px-1.5 py-0.5 rounded text-[9px] font-bold w-fit mb-1">8. CALL TO ACTION</p>
                      <p>Want us to audit your follow-up workflows? <a href="#" className="text-purple font-semibold underline">Click here to book a 15-min process review.</a></p>
                    </div>
                  </div>
                </Card>
              </div>

            </div>
          </div>
        )}

        {/* 9. 35 FTC TRIGGERS VIEW */}
        {activeId === 'ftc' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${CATEGORIES.COMPLIANCE.color} font-mono font-bold`}>
                    COMPLIANCE & RISK MANAGEMENT
                  </span>
                  <h1 className="text-lg font-semibold text-white">35 FTC Triggers Framework</h1>
                </div>
                <p className="text-xs text-muted mt-0.5">Safety audit framework for reviewing copy, scripts, and promotional claims prior to release.</p>
              </div>
              <button 
                onClick={() => { selectTab('tool_checker'); setActiveCheckerTab('ftc'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple text-white text-xs font-semibold hover:bg-purple-hover transition-colors"
              >
                <ClipboardList size={13} />
                <span>Test in Copy Reviewer</span>
              </button>
            </div>

            <Card className="p-5">
              <div className="flex items-center gap-3 text-red">
                <AlertTriangle size={20} className="flex-shrink-0" />
                <p className="text-xs text-dim leading-relaxed">
                  <strong>Risk Mitigation:</strong> Real estate fundraising is heavily scrutinized. Testimonials, social proof, and income predictions must remain compliant. Avoid absolute guarantees or deceptive metrics that imply certain outcomes.
                </p>
              </div>
            </Card>

            {/* Avoid checklist categorized */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3 border-l-4 border-l-red">
                <h4 className="text-xs font-bold text-red uppercase tracking-wider">🚫 Prohibited Claims</h4>
                <p className="text-[11px] text-muted">These triggers should never appear in active advertising copy or landing page content:</p>
                <ul className="space-y-2 text-xs text-dim">
                  <li className="flex items-start gap-2">
                    <span className="text-red font-bold font-mono mt-0.5">-</span>
                    <span><strong>Unsupported income claims:</strong> Mentioning returns (e.g. "make 25% APR") without explicit track record reports and SEC disclosures.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red font-bold font-mono mt-0.5">-</span>
                    <span><strong>Guaranteed outcome claims:</strong> Words like "risk-free", "guaranteed equity", "100% safe", or "principal secure".</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red font-bold font-mono mt-0.5">-</span>
                    <span><strong>Overstated ease:</strong> Implying capital growth or real estate passive investing takes "zero effort" or requires "no experience".</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-4 space-y-3 border-l-4 border-l-yellow">
                <h4 className="text-xs font-bold text-yellow uppercase tracking-wider">⚠️ High-Risk Triggers</h4>
                <p className="text-[11px] text-muted">Use with extreme caution. Ensure clear disclosures and contextual caveats are immediately adjacent:</p>
                <ul className="space-y-2 text-xs text-dim">
                  <li className="flex items-start gap-2">
                    <span className="text-yellow font-bold font-mono mt-0.5">!</span>
                    <span><strong>Misleading urgency:</strong> Using false timers or claiming a deal is "closing in 5 minutes" when it remains open for weeks.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow font-bold font-mono mt-0.5">!</span>
                    <span><strong>Cherry-picked case studies:</strong> Illustrating only the best-performing asset in your history while ignoring underperforming holdings.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow font-bold font-mono mt-0.5">!</span>
                    <span><strong>Testimonials with omissions:</strong> Showing LP success quotes that fail to mention material fees, risk factors, or sponsor relationships.</span>
                  </li>
                </ul>
              </Card>
            </div>

            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Target Copy Audit Checklist</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  'Landing Page Headlines', 'Facebook / Google Ads', 'Sales/VSL Video Scripts',
                  'Webinar Pitch Slides', 'Email Broadcasts', 'Investor Decks / Pitchbooks',
                  'Case Studies & Reports', 'Testimonial Video Clips', 'SMS Automation Sequences'
                ].map(item => (
                  <div key={item} className="bg-bg border border-border p-2 rounded text-center text-xs text-dim font-medium">
                    ✓ {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* 10. INTERACTIVE SMART ASSESSMENT TOOL */}
        {activeId === 'tool_assessment' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-white">SMART Method™ Maturity Assessment</h1>
                <p className="text-xs text-muted mt-0.5">Evaluate your capital-raising infrastructure to spot bottlenecks and leakage points.</p>
              </div>
              <button 
                onClick={resetAssessment}
                className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors"
              >
                <RefreshCw size={12} />
                <span>Reset</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Score Gauge Card */}
              <div className="md:col-span-1 bg-card border border-border rounded-lg p-5 flex flex-col justify-between items-center text-center">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">Maturity Score</p>
                  <p className="text-5xl font-extrabold text-white font-mono mt-2">{totalScore} <span className="text-lg text-muted">/ 25</span></p>
                  <div className="h-1.5 w-32 bg-border rounded-full mx-auto overflow-hidden mt-3">
                    <div className="h-full bg-purple transition-all" style={{ width: `${scorePct}%` }} />
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-4 w-full">
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Maturity Level</p>
                  <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full border ${maturity.color} font-semibold mt-1.5`}>
                    {maturity.label}
                  </span>
                  <p className="text-[11px] text-muted mt-3 leading-relaxed">
                    {maturity.desc}
                  </p>
                </div>
              </div>

              {/* Assessment Form Card */}
              <div className="md:col-span-2 bg-card border border-border rounded-lg p-5 space-y-6">
                {[
                  { 
                    key: 'systems', 
                    label: 'Systems Infrastructure', 
                    desc: 'Where do new leads go? How are they tracked?',
                    opt1: 'Scattered spreadsheets, notes inside Gmail, contacts in personal phone memory.',
                    opt5: 'Unified CRM. All lead paths, categories (tags), task follow-ups, and pipeline stages are clearly mapped.' 
                  },
                  { 
                    key: 'marketing', 
                    label: 'Marketing Engine', 
                    desc: 'How do you capture interest and educate prospects?',
                    opt1: 'Word of mouth/referrals only. No landing pages, ads, webinars, or content pipelines.',
                    opt5: 'Structured funnel path with high-value educational content, magnets, webinars, and trust-builders.' 
                  },
                  { 
                    key: 'automation', 
                    label: 'Automation Flow', 
                    desc: 'What prevents follow-up leakage?',
                    opt1: 'Manual tracking. Emails are sent by hand, reminders depend on checking calendars.',
                    opt5: 'Actions trigger steps automatically: tag logs, email welcomes, nurture rules, SMS booking reminders.' 
                  },
                  { 
                    key: 'relationships', 
                    label: 'Relationships & Trust', 
                    desc: 'How do you cultivate hot commitments?',
                    opt1: 'Purely digital or zero follow-up. Do not know who is warm or ready for soft-commits.',
                    opt5: 'Operator uses automated alerts to prioritize high-value human phone calls, VIP webinars, and updates.' 
                  },
                  { 
                    key: 'training', 
                    label: 'Training & Playbooks', 
                    desc: 'Is the system understood by execution teams?',
                    opt1: 'No documentation or standard SOPs. We don\'t know compliance rules or template guides.',
                    opt5: 'Complete playbooks: copy templates, compliance checklists (FTC), operational SOPs, and scripts.' 
                  },
                ].map(item => (
                  <div key={item.key} className="space-y-2 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-xs font-semibold text-white">{item.label}</h4>
                      <span className="text-xs font-bold text-purple font-mono">Score: {assessment[item.key]}</span>
                    </div>
                    <p className="text-[10px] text-muted">{item.desc}</p>
                    
                    {/* Score Selector slider */}
                    <div className="flex items-center gap-3 py-1">
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={assessment[item.key]}
                        onChange={e => handleAssessmentChange(item.key, parseInt(e.target.value))}
                        className="flex-1 accent-purple bg-bg h-1 rounded"
                      />
                      <span className="w-4 text-center font-mono text-xs text-white font-bold">{assessment[item.key]}</span>
                    </div>

                    <div className="flex justify-between text-[9px] text-muted leading-tight">
                      <span className="w-5/12 text-left">Level 1: {item.opt1}</span>
                      <span className="w-5/12 text-right">Level 5: {item.opt5}</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* Diagnostic Recommendations Table */}
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Maturity Improvement Checklist</p>
              <div className="space-y-4">
                {[
                  {
                    k: 'Systems',
                    score: assessment.systems,
                    rec: assessment.systems <= 3 
                      ? 'Action Required: Import contacts from phone & Gmail into S2. Set up pipeline tracking columns representing Lead, Warm, Qualified, Committed, and Funded stages.'
                      : 'Systems check: Great progress. Perform monthly audits of contact tag accuracy and database pipeline hygiene.'
                  },
                  {
                    k: 'Marketing',
                    score: assessment.marketing,
                    rec: assessment.marketing <= 3
                      ? 'Action Required: Build one core landing page containing an educational lead magnet or register widget for a webinar using the Core Five Foundation.'
                      : 'Marketing check: High attention flow. Focus on building retargeting ads or launching an investor referral cycle.'
                  },
                  {
                    k: 'Automation',
                    score: assessment.automation,
                    rec: assessment.automation <= 3
                      ? 'Action Required: Turn on automated GHL workflows for incoming leads. Link opt-in forms to trigger a tag log and welcome sequence immediately.'
                      : 'Automation check: High consistency. Focus on building click-based behaviors (e.g. alert sales when an LP views a deal deck).'
                  },
                  {
                    k: 'Relationships',
                    score: assessment.relationships,
                    rec: assessment.relationships <= 3
                      ? 'Action Required: Deploy the CRAC Method. Reactivate your list with check-ins, compile warmth metrics, and schedule calls with qualified candidates.'
                      : 'Relationships check: Strong execution. Solidify VIP check-in routines and organize exclusive LP mastermind webinars.'
                  },
                  {
                    k: 'Training',
                    score: assessment.training,
                    rec: assessment.training <= 3
                      ? 'Action Required: Train your team on compliance triggers. Run copy reviews using the 35 FTC Triggers framework and write template guides.'
                      : 'Training check: Good compliance/alignment. Hold monthly campaign performance audits and update SOP documents.'
                  }
                ].map(item => (
                  <div key={item.k} className="flex gap-4 items-start text-xs border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <div className="w-24 flex-shrink-0">
                      <p className="font-semibold text-white">{item.k}</p>
                      <span className={`inline-block text-[10px] font-mono font-bold mt-1 px-1.5 py-0.5 rounded ${item.score <= 3 ? 'bg-red/10 text-red border border-red/20' : 'bg-green/10 text-green border border-green/20'}`}>
                        Score: {item.score}
                      </span>
                    </div>
                    <div className="text-dim leading-relaxed">
                      {item.rec}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* 11. INTERACTIVE COPY COMPLIANCE CHECKER */}
        {activeId === 'tool_checker' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-white">Copy Compliance & Structure Checker</h1>
              <p className="text-xs text-muted mt-0.5">Paste your email copy, scripts, or landing page drafts to verify structure and compliance rules.</p>
            </div>

            {/* Split layout: Text editor vs Checklist board */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              
              {/* Textarea Workspace */}
              <div className="xl:col-span-3 space-y-4">
                <Card className="p-4 bg-bg border border-border flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                    <p className="text-xs font-semibold text-white">Copy Editor Sandbox</p>
                    <button 
                      onClick={() => setCopyText('')}
                      className="text-[10px] text-muted hover:text-white transition-colors"
                    >
                      Clear Copy
                    </button>
                  </div>
                  <textarea
                    placeholder="Paste or write your marketing copy here to evaluate it..."
                    value={copyText}
                    onChange={e => setCopyText(e.target.value)}
                    rows={12}
                    className="w-full bg-card text-xs text-dim p-4 border border-border rounded-lg focus:outline-none focus:border-purple/50 leading-relaxed font-mono resize-y"
                  />
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>Characters: {copyText.length}</span>
                    <span>Words: {copyText.split(/\s+/).filter(Boolean).length}</span>
                  </div>
                </Card>
              </div>

              {/* Checklist evaluation board */}
              <div className="xl:col-span-2 space-y-4">
                <Card className="p-4 space-y-4">
                  {/* Select Checklist Category */}
                  <div className="flex rounded bg-bg p-1 border border-border">
                    {[
                      { id: 'ftc', label: 'FTC Compliance' },
                      { id: 'corefive', label: 'Core Five' },
                      { id: 'email', label: 'Email Flow' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveCheckerTab(tab.id)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                          activeCheckerTab === tab.id
                            ? 'bg-purple text-white shadow'
                            : 'text-dim hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Progress Indicator */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-semibold text-white">Evaluation Progress</span>
                      <span className="font-mono text-purple font-bold">{progressPct}%</span>
                    </div>
                    <div className="h-1.5 bg-bg border border-border rounded-full overflow-hidden">
                      <div className="h-full bg-purple transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted">
                      Verify that your drafted copy satisfies each of the parameters below:
                    </p>
                  </div>

                  {/* Checkbox Checklist */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {currentChecklist.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        className={`p-2.5 rounded border border-border bg-bg/50 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-3 ${
                          checkerChecked[item.id] ? 'border-purple/35 bg-purple-muted/5' : ''
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          checkerChecked[item.id] ? 'bg-purple border-purple text-white' : 'border-border'
                        }`}>
                          {checkerChecked[item.id] && <CheckCircle2 size={11} className="stroke-[3]" />}
                        </div>
                        <span className={`text-[11px] leading-tight select-none ${
                          checkerChecked[item.id] ? 'text-white font-medium' : 'text-dim'
                        }`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] uppercase font-bold text-muted mb-1.5">Checker Assessment Status</p>
                    <div className="bg-bg border border-border rounded p-2.5 text-[11px] text-dim leading-normal">
                      {progressPct === 100 ? (
                        <p className="text-green font-semibold">✓ Perfect Score! Your copy is structured and fully ready to deploy according to this framework.</p>
                      ) : progressPct > 50 ? (
                        <p className="text-yellow">⚠️ Emerging Structure. Satisfies some rules, but check the remaining unchecked boxes to ensure safe, solid copy.</p>
                      ) : (
                        <p className="text-muted">💡 Review parameters on the checklist and compare with your text in the sandbox. Audit all compliance warnings.</p>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
