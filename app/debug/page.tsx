"use client";

import React, { useState, useEffect } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import AppCard from "@/components/ui/AppCard";
import { useAuth } from "@/hooks/use-auth";
import { API_CONFIG } from "@/lib/api/config";
import { noticesApi } from "@/lib/api/notices";
import { classesApi } from "@/lib/api/classes";

export default function DebugPage() {
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState({
    classes: 0,
    notices: 0,
    apiBase: API_CONFIG.BASE_URL,
    mockMode: API_CONFIG.MOCK_MODE ? "ON" : "OFF"
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [cRes, nRes] = await Promise.all([
          classesApi.getClasses(),
          noticesApi.getNotices()
        ]);
        setStats(prev => ({
          ...prev,
          classes: cRes.data?.length || 0,
          notices: nRes.data?.length || 0
        }));
      } catch (err) {
        console.error("Debug stats fetch failed", err);
      }
    };
    fetchStats();
  }, []);

  return (
    <MobileShell title="System Debug">
      <div className="space-y-4 mt-4 pb-20">
        <section>
          <h2 className="text-[13px] font-black text-subtle mb-3 px-1">API ENVIRONMENT</h2>
          <AppCard className="p-4 space-y-3">
            <div className="flex justify-between items-center text-[14px]">
              <span className="font-bold">Base URL</span>
              <code className="bg-muted px-2 py-1 rounded text-primary">{stats.apiBase}</code>
            </div>
            <div className="flex justify-between items-center text-[14px]">
              <span className="font-bold">Mock Mode</span>
              <span className={stats.mockMode === "ON" ? "text-orange-500 font-bold" : "text-green-500 font-bold"}>
                {stats.mockMode}
              </span>
            </div>
          </AppCard>
        </section>

        <section>
          <h2 className="text-[13px] font-black text-subtle mb-3 px-1">SESSION STATUS</h2>
          <AppCard className="p-4 space-y-3">
            <div className="flex justify-between items-center text-[14px]">
              <span className="font-bold">Authenticated</span>
              <span>{isAuthenticated ? "✅ YES" : "❌ NO"}</span>
            </div>
            {user && (
              <div className="flex justify-between items-center text-[14px]">
                <span className="font-bold">User</span>
                <span>{user.name} ({user.role})</span>
              </div>
            )}
          </AppCard>
        </section>

        <section>
          <h2 className="text-[13px] font-black text-subtle mb-3 px-1">DATA INTEGRATION</h2>
          <AppCard className="p-4 space-y-3">
            <div className="flex justify-between items-center text-[14px]">
              <span className="font-bold">Classes Count</span>
              <span className="font-black text-primary">{stats.classes}</span>
            </div>
            <div className="flex justify-between items-center text-[14px]">
              <span className="font-bold">Notices Count</span>
              <span className="font-black text-primary">{stats.notices}</span>
            </div>
          </AppCard>
        </section>

        <p className="text-[11px] text-center text-subtle/50 font-bold uppercase tracking-widest mt-8">
          Production environments should hide this page.
        </p>
      </div>
    </MobileShell>
  );
}
