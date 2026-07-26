import { useState, useEffect } from 'react';
import { UserAnalytics, DeviceAnalytics } from '../types';
import { ClientAPI } from '../api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { BarChart3, PieChartIcon, ArrowRightLeft, Users, ShieldAlert, Smartphone, Layers, Laptop, User, Wifi, Shield } from 'lucide-react';
import Skeleton from './Skeleton';

interface AnalyticsViewProps {
  hasApiKey?: boolean;
  onNavigate?: (tab: string) => void;
}

export default function AnalyticsView({ hasApiKey = true, onNavigate }: AnalyticsViewProps) {
  const [analytics, setAnalytics] = useState<UserAnalytics[]>([]);
  const [deviceAnalytics, setDeviceAnalytics] = useState<DeviceAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'profile' | 'device'>('profile');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string>('');
  const [error, setError] = useState('');

  const getDeviceKey = (dev: DeviceAnalytics, index: number): string => {
    if (dev.id && dev.id !== '__UNIDENTIFIED__' && dev.id !== 'unidentified') {
      return dev.id;
    }
    const ip = (dev.clientIp && dev.clientIp !== 'N/A' && dev.clientIp !== '0.0.0.0') ? dev.clientIp : 'noip';
    return `${dev.deviceName}__${ip}__${dev.profileName || ''}__${index}`;
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const [pData, dData] = await Promise.all([
        ClientAPI.getAnalytics(),
        ClientAPI.getDeviceAnalytics()
      ]);
      const safeP = Array.isArray(pData) ? pData : [];
      const safeD = Array.isArray(dData) ? dData : [];

      setAnalytics(safeP);
      setDeviceAnalytics(safeD);

      if (safeP.length > 0 && !selectedUser) {
        setSelectedUser(safeP[0].username);
      }
      if (safeD.length > 0) {
        setSelectedDeviceKey(prevKey => {
          const exists = safeD.some((d, idx) => getDeviceKey(d, idx) === prevKey);
          if (prevKey && exists) return prevKey;
          return getDeviceKey(safeD[0], 0);
        });
      }
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setError('Could not pull analytics records from API server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const activeAnalytics = analytics.find(a => a.username === selectedUser) || analytics[0];
  const activeDevice = deviceAnalytics.find((d, idx) => getDeviceKey(d, idx) === selectedDeviceKey) || deviceAnalytics[0];

  // Profile chart data
  const totalQueries = activeAnalytics?.summary?.totalQueries ?? 0;
  const totalBlocks = activeAnalytics?.summary?.totalBlocks ?? 0;
  const blockedPercentage = activeAnalytics?.summary?.blockedPercentage ?? 0;
  const allowedQueries = Math.max(0, totalQueries - totalBlocks);

  const profileChartData = (activeAnalytics?.topDomains || []).map(d => {
    const domainName = d?.domain || (d as any)?.name || 'Unknown';
    return {
      name: domainName.length > 20 ? domainName.substring(0, 18) + '...' : domainName,
      Queries: typeof d?.queries === 'number' ? d.queries : 0,
      Blocks: typeof d?.blocks === 'number' ? d.blocks : 0
    };
  });

  const profilePieData = activeAnalytics ? [
    { name: 'Allowed Queries', value: allowedQueries },
    { name: 'Blocked Ads & Threats', value: totalBlocks }
  ] : [];

  // Device chart data
  const devQueries = activeDevice?.totalQueries ?? 0;
  const devBlocks = activeDevice?.blockedQueries ?? 0;
  const devPct = activeDevice?.blockedPercentage ?? 0;
  const devAllowed = Math.max(0, devQueries - devBlocks);

  const deviceChartData = (activeDevice?.topDomains || []).map(d => {
    const domainName = d?.domain || 'Unknown';
    return {
      name: domainName.length > 20 ? domainName.substring(0, 18) + '...' : domainName,
      Queries: typeof d?.queries === 'number' ? d.queries : 0,
      Blocks: typeof d?.blocks === 'number' ? d.blocks : 0
    };
  });

  const devicePieData = activeDevice ? [
    { name: 'Allowed Queries', value: devAllowed },
    { name: 'Blocked Ads & Threats', value: devBlocks }
  ] : [];

  return (
    <div className="space-y-6" id="analytics-view-container">
      {!hasApiKey ? (
        <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-8 text-center space-y-3">
          <Shield className="mx-auto text-amber-400" size={32} />
          <h3 className="text-amber-200 font-bold text-sm">NextDNS Account Disconnected</h3>
          <p className="text-xs text-amber-300/80 max-w-md mx-auto">
            Please configure your NextDNS API key in Settings to connect your account and view traffic analytics.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('settings')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs transition"
            >
              Configure API Key
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Top Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-400" />
            Security Analytics & Traffic Reports
          </h2>
          <p className="text-xs text-slate-400 mt-1">Cross-profile and device-specific DNS traffic distribution and threat analytics.</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
          {/* Toggle Profile vs Device Analytics */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('profile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'profile'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={14} />
              <span>Profiles</span>
            </button>
            <button
              onClick={() => setViewMode('device')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'device'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone size={14} />
              <span>Per Device</span>
            </button>
          </div>

          {/* Sub-selector */}
          {viewMode === 'profile' ? (
            <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
              {analytics.map(user => (
                <button
                  key={user.username}
                  onClick={() => setSelectedUser(user.username)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                    selectedUser === user.username
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {user.username.split(' ')[0]}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
              {deviceAnalytics.map((dev, idx) => {
                const devKey = getDeviceKey(dev, idx);
                const isSelected = selectedDeviceKey === devKey;
                return (
                  <button
                    key={devKey}
                    onClick={() => setSelectedDeviceKey(devKey)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                      isSelected
                        ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {dev.deviceName}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton variant="stat" count={3} />
          <Skeleton variant="chart" count={2} />
        </div>
      ) : error ? (
        <div className="bg-red-950/20 border border-red-500/20 p-8 text-center rounded-xl text-red-400 space-y-3">
          <ShieldAlert className="mx-auto" size={32} />
          <p className="text-sm font-semibold">{error}</p>
          <button 
            onClick={fetchAnalytics}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 px-4 py-1.5 rounded-lg text-xs transition"
          >
            Retry Fetch
          </button>
        </div>
      ) : viewMode === 'profile' ? (
        /* --- PROFILE ANALYTICS CONTENT --- */
        !activeAnalytics ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center space-y-3">
            <ShieldAlert size={32} className="mx-auto text-slate-600" />
            <h3 className="text-slate-300 font-bold text-sm">No Profile Analytics Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              No analytics records could be loaded for NextDNS profiles. Ensure your NextDNS API key is entered in Settings and active profiles exist.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Traffic Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Total Queries</span>
                  <h4 className="text-lg font-bold text-white mt-0.5">{totalQueries.toLocaleString()}</h4>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Blocked Queries</span>
                  <h4 className="text-lg font-bold text-red-400 mt-0.5">{totalBlocks.toLocaleString()}</h4>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <Users size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Profile Block Rate</span>
                  <h4 className="text-lg font-bold text-emerald-400 mt-0.5">{blockedPercentage}%</h4>
                </div>
              </div>
            </div>

            {/* Charts Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-100">Top Domains Chart ({activeAnalytics.username})</h3>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded font-mono">
                    Query Count
                  </span>
                </div>

                <div className="h-[280px] w-full text-xs font-mono">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profileChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Queries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Blocks" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <PieChartIcon size={14} className="text-blue-400" />
                    Traffic Quality Ratio
                  </h3>
                  <p className="text-[10px] text-slate-400">Queries processed and filtered by NextDNS firewall.</p>
                </div>

                <div className="h-[200px] w-full flex justify-center items-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={profilePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        <Cell fill="#3b82f6" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute text-center pointer-events-none">
                    <span className="text-xl font-bold text-white block">{blockedPercentage}%</span>
                    <span className="text-[9px] text-slate-400 uppercase font-semibold">Blocked</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs pt-3 border-t border-slate-800">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Allowed</span>
                    <span className="font-bold text-blue-400">{allowedQueries.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Blocked</span>
                    <span className="font-bold text-red-400">{totalBlocks.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* --- DEVICE ANALYTICS CONTENT --- */
        !activeDevice ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center space-y-3">
            <Smartphone size={32} className="mx-auto text-slate-600" />
            <h3 className="text-slate-300 font-bold text-sm">No Device Data Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              No device analytics could be retrieved from NextDNS. Devices will appear here as query telemetry is recorded.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Device Info & Traffic Summary Cards */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {activeDevice.deviceName}
                    <span className="text-xs font-mono font-normal bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                      {activeDevice.clientIp}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Profile Endpoint: <span className="text-cyan-400 font-semibold">{activeDevice.profileName}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                <div className="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Queries</span>
                  <span className="text-base font-bold text-slate-100">{devQueries.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Blocked</span>
                  <span className="text-base font-bold text-emerald-400">{devBlocks.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Block Rate</span>
                  <span className="text-base font-bold text-cyan-300">{devPct}%</span>
                </div>
              </div>
            </div>

            {/* Device Charts Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Smartphone size={16} className="text-cyan-400" />
                    Top Blocked & Access Domains for {activeDevice.deviceName}
                  </h3>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded font-mono">
                    Per-Device Activity
                  </span>
                </div>

                <div className="h-[280px] w-full text-xs font-mono">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deviceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Queries" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Blocks" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Blocked Domains Detailed List */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <Shield size={16} className="text-red-400" />
                    Blocked Domains Breakdown
                  </h3>
                  <p className="text-[10px] text-slate-400">Specific domains blocked for {activeDevice.deviceName}</p>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {activeDevice.blockedDomains.map((bd, i) => (
                    <div key={i} className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl flex justify-between items-center text-xs">
                      <div className="font-mono text-slate-200 truncate max-w-[170px]" title={bd.domain}>
                        {bd.domain}
                      </div>
                      <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-bold">
                        {bd.blocks} blocks
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}
        </>
      )}
    </div>
  );
}
