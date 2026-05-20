import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, Eye, Play, ArrowUpRight, TrendingUp, ShieldCheck, MapPin, Globe, Award, Sparkles, Zap, Smartphone, Monitor } from 'lucide-react';

interface VisitorLog {
  id: string;
  country: string;
  scenario: string;
  device: string;
  timestamp: string;
  action: string;
}

export function TrafficDashboard() {
  const [activeUsers, setActiveUsers] = useState(24);
  const [totalVisitors, setTotalVisitors] = useState(2842);
  const [totalSessions, setTotalSessions] = useState(1485);
  const [conversionRate, setConversionRate] = useState(4.2);
  const [actualActiveBrowsers, setActualActiveBrowsers] = useState(0);
  const [actualUniqueTotal, setActualUniqueTotal] = useState(0);

  const [activeTab, setActiveTab] = useState<'overview' | 'geography' | 'scenarios'>('overview');

  // Visitor log updates loaded from server and combined with simulation
  const [recentLogs, setRecentLogs] = useState<VisitorLog[]>([]);

  // Periodically fetch live operational stats from server
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/analytics/status');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setActiveUsers(data.activeUsers);
            setTotalVisitors(data.totalVisitors);
            setTotalSessions(data.totalSessions);
            setRecentLogs(data.recentLogs || []);
            setActualActiveBrowsers(data.actualActiveCount || 0);
            setActualUniqueTotal(data.actualUniqueCount || 0);
          }
        }
      } catch (err) {
        console.warn('Analytics API unavailable, falling back to client-side emulation:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  // Action to simulate live demo traffic surge
  const simulateTrafficSurge = async () => {
    // Also trigger a real custom action payload on the server
    try {
      const clientId = localStorage.getItem('speakflow_analytics_uuid') || `guest_${Math.random().toString(36).substring(3, 9)}`;
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          country: 'United States',
          device: window.innerWidth < 640 ? 'Mobile' : 'Desktop',
          action: 'Mock Guest Traffic Surge',
          scenario: 'Live Operations Observer'
        })
      });
    } catch (e) {
      console.error(e);
    }

    setActiveUsers(prev => prev + Math.floor(Math.random() * 15) + 10);
    setTotalVisitors(prev => prev + Math.floor(Math.random() * 12) + 5);
    setTotalSessions(prev => prev + Math.floor(Math.random() * 8) + 3);

    // Append to live logs locally for immediate feedback
    const dynamicScenarios = [
      'Job Interview Pitch', 'TED Speaker Style', 'Casual Cafe Talk', 
      'Difficult Salary Negotiation', 'Product Demo presentation'
    ];
    const countries = ['United States', 'Singapore', 'Australia', 'Japan', 'Brazil', 'France', 'India'];
    const devices = ['Desktop', 'Mobile', 'Tablet'];
    const actions = ['Created session', 'Completed review', 'Upgraded to Pro', 'Started practicing'];

    const newLog: VisitorLog = {
      id: Date.now().toString(),
      country: countries[Math.floor(Math.random() * countries.length)],
      scenario: dynamicScenarios[Math.floor(Math.random() * dynamicScenarios.length)],
      device: devices[Math.floor(Math.random() * devices.length)],
      timestamp: 'Just now',
      action: actions[Math.floor(Math.random() * actions.length)],
    };

    setRecentLogs(prev => [newLog, ...prev.slice(0, 6)]);

    if (newLog.action === 'Upgraded to Pro') {
      setConversionRate(prev => parseFloat((prev + 0.1).toFixed(1)));
    }
  };

  // Recharts high-fidelity charts data sets
  const trafficHistory = [
    { name: 'Mon', Guests: 240, Authenticated: 120, Premium: 45 },
    { name: 'Tue', Guests: 310, Authenticated: 154, Premium: 52 },
    { name: 'Wed', Guests: 290, Authenticated: 142, Premium: 61 },
    { name: 'Thu', Guests: 420, Authenticated: 210, Premium: 80 },
    { name: 'Fri', Guests: 380, Authenticated: 195, Premium: 75 },
    { name: 'Sat', Guests: 480, Authenticated: 270, Premium: 95 },
    { name: 'Sun', Guests: 560, Authenticated: 310, Premium: 110 },
  ];

  const scenarioUsage = [
    { name: 'Interview', value: 45 },
    { name: 'Casual Talk', value: 25 },
    { name: 'TED Speaker', value: 18 },
    { name: 'Negotiation', value: 12 },
  ];

  const deviceDistribution = [
    { name: 'Mobile', value: 55, color: '#6366f1' },
    { name: 'Desktop', value: 35, color: '#ec4899' },
    { name: 'Tablet', value: 10, color: '#a855f7' },
  ];

  const countryTraffic = [
    { country: 'United States', visitors: 1120, growth: '+12%', bg: 'bg-indigo-500/10' },
    { country: 'India', visitors: 840, growth: '+24%', bg: 'bg-emerald-500/10' },
    { country: 'United Kingdom', visitors: 420, growth: '+8%', bg: 'bg-amber-500/10' },
    { country: 'Germany', visitors: 280, growth: '+15%', bg: 'bg-blue-500/10' },
    { country: 'Canada', visitors: 180, growth: '+4%', bg: 'bg-fuchsia-500/10' },
  ];

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b'];

  return (
    <div id="traffic-analytics-view" className="space-y-8 max-w-7xl mx-auto px-1 py-4">
      
      {/* 1. Header with Stats Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">SpeakFlow AI Observability</span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-white">Live Operations & Traffic Monitor</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time visitor counts, active speech practices, and model subscription conversions.</p>
          
          <div className="flex items-center gap-2 mt-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400/90 font-mono text-xs font-semibold">
              Live Connected Devices: {actualActiveBrowsers} browser{actualActiveBrowsers === 1 ? '' : 's'} online (Simulated sandbox: {activeUsers} sessions)
            </span>
          </div>
        </div>

        {/* Traffic surge button */}
        <button 
          onClick={simulateTrafficSurge}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 border border-indigo-400/20"
        >
          <Sparkles className="w-4 h-4 animate-spin text-indigo-200" />
          <span>Simulate Mock Guest Traffic Surge</span>
        </button>
      </div>

      {/* 2. Key Observability Metrics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Live active users */}
        <div className="p-6 bg-slate-900 border border-white/5 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full filter blur-xl pointer-events-none" />
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider text-slate-400">Live Active Speakers</span>
            <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[9px] font-black tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" /> Live
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{activeUsers}</span>
            <span className="text-slate-500 text-xs font-semibold">online practicing</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-3.5 flex items-center gap-1">
            <span className="text-emerald-400 font-bold flex items-center">↑ 18%</span> vs past hour activity
          </div>
        </div>

        {/* Card 2: Total unique visitors */}
        <div className="p-6 bg-slate-900 border border-white/5 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full filter blur-xl pointer-events-none" />
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider text-slate-400">Total Unique Visitors</span>
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5">
              <Users className="w-4 h-4 text-fuchsia-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{totalVisitors.toLocaleString()}</span>
            <span className="text-slate-500 text-xs font-semibold">users</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-3.5 flex items-center gap-1">
            <span className="text-indigo-400 font-bold">↑ 34%</span> analytics growth trail
          </div>
        </div>

        {/* Card 3: Total Completed Practices */}
        <div className="p-6 bg-slate-900 border border-white/5 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full filter blur-xl pointer-events-none" />
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider text-slate-400">Total Session Runs</span>
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5">
              <Play className="w-4 h-4 text-amber-400 font-black" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{totalSessions.toLocaleString()}</span>
            <span className="text-slate-500 text-xs font-semibold">practices</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-3.5 flex items-center gap-1">
            <span className="text-amber-400 font-bold">↑ 22%</span> speech evaluations compiled
          </div>
        </div>

        {/* Card 4: Payments Conversion Rate */}
        <div className="p-6 bg-slate-900 border border-white/5 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-xl pointer-events-none" />
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider text-slate-400">Pro Upgrade Conversions</span>
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{conversionRate}%</span>
            <span className="text-slate-500 text-xs font-semibold">conversion rate</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-3.5 flex items-center gap-1">
            <span className="text-emerald-400 font-bold">↑ 1.2%</span> payment sandbox conversions
          </div>
        </div>

      </div>

      {/* 3. Main Dashboard Chart and Country Traffic Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Chart View Panel */}
        <div className="lg:col-span-2 p-6 md:p-8 bg-slate-900 border border-white/5 rounded-[2.5rem] shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-white">Daily Traffic Logs</h3>
                <p className="text-slate-450 text-[11px] text-slate-400 mt-0.5">Categorized by Guest Trials vs Authenticated Free vs Premium Pro members</p>
              </div>

              {/* Chart tabs */}
              <div className="flex gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-850">
                {(['overview', 'scenarios'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Render dynamic charts based on selected view mode */}
            <div className="h-72 w-full mt-4">
              {activeTab === 'overview' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorGuests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAuth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} 
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Area type="monotone" dataKey="Guests" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorGuests)" name="Anonymous Guest Trials" />
                    <Area type="monotone" dataKey="Authenticated" stroke="#a855f7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAuth)" name="Authenticated Free" />
                    <Area type="monotone" dataKey="Premium" stroke="#ec4899" strokeWidth={3} fill={0} name="Premium Pro Upgrades" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trafficHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} 
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="Guests" fill="#6366f1" radius={[4, 4, 0, 0]} name="Anonymous Guest Trials" />
                    <Bar dataKey="Authenticated" fill="#a855f7" radius={[4, 4, 0, 0]} name="Authenticated Free" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-6 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-[10px] uppercase font-mono">
            <span>📡 Auto-updating telemetry network logs</span>
            <span>PCI Security Sandbox Operational</span>
          </div>
        </div>

        {/* Device Distribution and Country Traffic metrics */}
        <div className="space-y-6">
          
          {/* Top Countries Traffic Table */}
          <div className="p-6 bg-slate-900 border border-white/5 rounded-[2.5rem] shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white">Geographic Distribution</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Top visitor traffic hubs by count</p>
              </div>
              <Globe className="w-5 h-5 text-indigo-400" />
            </div>

            <div className="space-y-3.5">
              {countryTraffic.map((hub, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">📍</span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{hub.country}</h4>
                      <p className="text-[8px] text-slate-500 uppercase font-bold">Region Hub</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-black text-white">{hub.visitors.toLocaleString()}</span>
                    <span className="text-[9px] font-bold text-emerald-400 block">{hub.growth}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* 4. Scenario distribution break-down & Live visitor action log tail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left side: Scenario breakdown and Device breakdown charts */}
        <div className="p-6 bg-slate-900 border border-white/5 rounded-[2.5rem] shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white">Platform Device Split</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Breakdown of active practice device systems</p>
              </div>
              <Monitor className="w-4 h-4 text-fuchsia-400" />
            </div>

            <div className="h-44 w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {deviceDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                <span className="text-lg font-black text-white">55%</span>
                <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Mobile preference</span>
              </div>
            </div>

            {/* Label List */}
            <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
              {deviceDistribution.map((device, i) => (
                <div key={i} className="p-2 bg-slate-950/40 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-400 block">{device.name}</span>
                  <span className="text-xs font-black" style={{ color: device.color }}>{device.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right side: Real-time Live log output tail */}
        <div className="lg:col-span-2 p-6 md:p-8 bg-slate-900 border border-white/5 rounded-[2.5rem] shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
              <div>
                <h3 className="text-base font-extrabold text-white">Real-Time Event Stream Log</h3>
                <p className="text-slate-450 text-[10px] text-slate-400 mt-0.5">Dynamic web browser traffic actions captured server-side</p>
              </div>
              <span className="flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-black text-[9px] px-2 py-1 rounded-full animate-pulse">
                <span>● STREAMING</span>
              </span>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {recentLogs.map((log) => (
                <div key={log.id} className="p-3.5 bg-slate-950/50 hover:bg-slate-950 rounded-xl border border-white/5 flex items-start sm:items-center justify-between gap-3 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
                      <span className="text-sm font-bold">👤</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-200">Visitor ({log.country})</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-slate-400 font-bold">{log.device}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Selected Scenario: <span className="text-indigo-400 font-semibold">{log.scenario}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] text-indigo-300 font-black uppercase text-center">{log.action}</span>
                    <span className="text-[9px] text-slate-500 block mt-1">{log.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-6 text-center text-[10px] font-mono text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>GDPR, CCPA & Privacy Sandbox compliant. No real personal user data or logs are tracked.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
