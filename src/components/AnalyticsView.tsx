import { useState, useEffect } from 'react';
import { UserAnalytics } from '../types';
import { ClientAPI } from '../api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { BarChart3, PieChartIcon, ArrowRightLeft, Users, ShieldAlert, RefreshCw } from 'lucide-react';

export default function AnalyticsView() {
  const [analytics, setAnalytics] = useState<UserAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ClientAPI.getAnalytics();
      const safeData = Array.isArray(data) ? data : [];
      setAnalytics(safeData);
      if (safeData.length > 0) {
        setSelectedUser(safeData[0].username);
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

  const totalQueries = activeAnalytics?.summary?.totalQueries ?? 0;
  const totalBlocks = activeAnalytics?.summary?.totalBlocks ?? 0;
  const blockedPercentage = activeAnalytics?.summary?.blockedPercentage ?? 0;
  const allowedQueries = Math.max(0, totalQueries - totalBlocks);

  // Prepare chart data for top domains
  const topDomainsChartData = (activeAnalytics?.topDomains || []).map(d => {
    const domainName = d?.domain || (d as any)?.name || 'Unknown';
    const queries = typeof d?.queries === 'number' ? d.queries : 0;
    const blocks = typeof d?.blocks === 'number' ? d.blocks : 0;
    return {
      name: domainName.length > 20 ? domainName.substring(0, 18) + '...' : domainName,
      Queries: queries,
      Blocks: blocks
    };
  });

  // Prepare chart data for domain category distribution (Blocked vs Allowed)
  const pieChartData = activeAnalytics ? [
    { name: 'Allowed Queries', value: allowedQueries },
    { name: 'Blocked Ads & Threats', value: totalBlocks }
  ] : [];

  return (
    <div className="space-y-6" id="analytics-view-container">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-400" />
            Security Analytics & Reporting
          </h2>
          <p className="text-xs text-slate-400 mt-1">Cross-profile domain distribution and traffic patterns across the last 7 days.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* User Filter Tab List */}
          <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            {analytics.map(user => (
              <button
                key={user.username}
                onClick={() => setSelectedUser(user.username)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                  selectedUser === user.username
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {user.username.split(' ')[0]} {/* Grab first word */}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAnalytics}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition shrink-0"
            title="Refresh analytics data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-500 space-y-2">
          <RefreshCw className="animate-spin text-blue-500 mx-auto" size={24} />
          <p className="text-xs">Loading DNS analytical reports...</p>
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
      ) : !activeAnalytics ? (
        <div className="p-8 text-center text-slate-500 text-sm">No profiles found.</div>
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
            {/* Bar Chart: Most Visited/Blocked Domains */}
            <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-100">Top Domains Chart</h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded font-mono">
                  Unit: Absolute Query Count
                </span>
              </div>

              <div className="h-[280px] w-full text-xs font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topDomainsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
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

            {/* Pie Chart: Allowed vs Blocked Traffic Ratio */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <PieChartIcon size={14} className="text-blue-400" />
                  Traffic Quality Ratio
                </h3>
                <p className="text-[10px] text-slate-400">Total queries processed and cataloged by NextDNS firewall.</p>
              </div>

              <div className="h-[200px] w-full flex justify-center items-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieChartData.map((_entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={idx === 0 ? '#3b82f6' : '#ef4444'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text overlay */}
                <div className="absolute text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Blocked</span>
                  <span className="text-base font-extrabold text-red-400">{blockedPercentage}%</span>
                </div>
              </div>

              {/* Legend mapping */}
              <div className="space-y-2 pt-3 border-t border-slate-800/60 text-xs">
                {pieChartData.map((entry, idx) => (
                  <div key={entry.name} className="flex justify-between items-center font-mono">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: idx === 0 ? '#3b82f6' : '#ef4444' }} />
                      <span className="text-slate-300 text-[11px]">{entry.name}</span>
                    </div>
                    <span className="font-bold text-slate-200">{(entry.value ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Table Breakdown of Top 10 Domains */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Top Domains Traffic Breakdown</h3>
            
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/30">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="px-4 py-2.5">Domain Name</th>
                    <th className="px-4 py-2.5 text-right">Total Queries</th>
                    <th className="px-4 py-2.5 text-right">Blocks Triggered</th>
                    <th className="px-4 py-2.5 text-right">Resolution Security Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {(activeAnalytics.topDomains || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-xs">
                        No domain traffic recorded for this profile yet.
                      </td>
                    </tr>
                  ) : (
                    (activeAnalytics.topDomains || []).map((item, idx) => {
                      const domainName = item?.domain || (item as any)?.name || `domain-${idx}`;
                      const queries = typeof item?.queries === 'number' ? item.queries : 0;
                      const blocks = typeof item?.blocks === 'number' ? item.blocks : 0;
                      const blockRate = queries > 0 ? ((blocks / queries) * 100) : 0;
                      
                      return (
                        <tr key={domainName} className="hover:bg-slate-900/20 text-slate-300">
                          <td className="px-4 py-3 select-all">{domainName}</td>
                          <td className="px-4 py-3 text-right">{queries.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-red-400">{blocks.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            {blockRate >= 99.9 ? (
                              <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/25 px-2 py-0.5 rounded-full font-bold">
                                Fully Blocked
                              </span>
                            ) : blockRate > 0 ? (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold">
                                Partially Filtered
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-bold">
                                Allowed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
