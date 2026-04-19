import React from 'react';
import { Users, Video, Clock, TrendingUp } from 'lucide-react';

export function AnalyticsPanel() {
  const stats = {
    visitorsToday: 184,
    totalMeetings: 47,
    avgDuration: "24 min",
    peakHour: "8:30 PM"
  };

  return (
    <div className="glass border border-white/10 rounded-3xl p-6 h-fit sticky top-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          📊 Visitor Analytics
        </h3>
        <span className="px-3 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded-2xl font-medium">LIVE</span>
      </div>

      <div className="space-y-6">
        <div className="flex gap-4 items-center">
          <div className="w-11 h-11 bg-flame-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="text-flame-400" size={24} />
          </div>
          <div className="flex-1">
            <p className="text-white/60 text-sm">Visitors Today</p>
            <p className="text-4xl font-black text-white tracking-tighter">{stats.visitorsToday}</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="w-11 h-11 bg-cyan-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Video className="text-cyan-400" size={24} />
          </div>
          <div className="flex-1">
            <p className="text-white/60 text-sm">Meetings Hosted</p>
            <p className="text-4xl font-black text-white tracking-tighter">{stats.totalMeetings}</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="w-11 h-11 bg-emerald-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Clock className="text-emerald-400" size={24} />
          </div>
          <div className="flex-1">
            <p className="text-white/60 text-sm">Avg. Meeting Duration</p>
            <p className="text-4xl font-black text-white tracking-tighter">{stats.avgDuration}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/10 text-xs text-white/40 flex items-center gap-2">
        <TrendingUp size={14} />
        <span>Real-time • Powered by Vercel Analytics</span>
      </div>
    </div>
  );
}