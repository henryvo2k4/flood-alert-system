"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ComposedChart, Bar, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { 
  Droplets, Wind, Thermometer, CloudRain, Activity, AlertCircle, MapPin
} from "lucide-react";

// Tải Component bản đồ động (Bỏ qua SSR)
const MapNode = dynamic(
  () => import('../components/MapNode').then((mod) => mod.default), 
  { 
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-200/50 animate-pulse rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm">Đang kết nối vệ tinh tải bản đồ GIS...</div>
  }
);
interface SensorData {
  id: number;
  station_id: string;
  temperature: number;
  humidity: number;
  pressure: number;
  light_lux: number;
  rain_status: number;
  water_level_cm: number;
  wind_speed_ms: number;
  created_at: string;
}

const STATION_ID = "c518805a-efa1-4a0b-a4e9-e45b3cc993ef";

const neuCard = "bg-[#f4f7fb] rounded-2xl shadow-[6px_6px_12px_#d3d7de,-6px_-6px_12px_#ffffff] border border-white/60 p-6";

export default function AdvancedDashboard() {
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  const [historyData, setHistoryData] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(true);

  const formatTimestampLabel = (label: unknown) => {
    const raw = typeof label === "string" || typeof label === "number" || label instanceof Date
      ? label
      : String(label ?? "");
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(label ?? "") : date.toLocaleTimeString("vi-VN");
  };

  const fetchHistoryData = useCallback(async () => {
    const { data } = await supabase
      .from("sensor_logs")
      .select("*")
      .eq("station_id", STATION_ID)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      setLatestData(data[0]);
      setHistoryData(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // One-time mount hydration for live dashboard data. This is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistoryData();
    const channel = supabase
      .channel('realtime_sensor_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs', filter: `station_id=eq.${STATION_ID}` },
        (payload) => {
          const newData = payload.new as SensorData;
          setLatestData(newData);
          setHistoryData((current) => [newData, ...current].slice(0, 30));
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistoryData]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#eef2f6] text-slate-500 font-semibold">Đang tải dữ liệu không gian...</div>;
  if (!latestData) return <div className="min-h-screen flex items-center justify-center bg-[#eef2f6] text-slate-500">Chưa có dữ liệu từ trạm.</div>;

  const isFlooded = latestData.water_level_cm >= 10;
  const isStormy = latestData.wind_speed_ms > 15 && latestData.rain_status === 0;

  // Xử lý dữ liệu cho Biểu đồ Radar (Tính theo % mức độ cực đoan)
  const radarData = [
    { subject: 'Ngập lụt', A: Math.min((latestData.water_level_cm / 20) * 100, 100), fullMark: 100 },
    { subject: 'Nhiệt độ', A: Math.min((latestData.temperature / 50) * 100, 100), fullMark: 100 },
    { subject: 'Sức gió', A: Math.min((latestData.wind_speed_ms / 30) * 100, 100), fullMark: 100 },
    { subject: 'Độ ẩm', A: latestData.humidity, fullMark: 100 },
    { subject: 'Ánh sáng', A: Math.min((latestData.light_lux / 100000) * 100, 100), fullMark: 100 },
  ];

  return (
    <div className="min-h-screen bg-[#eef2f6] text-slate-700 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl shadow-inner"><Activity size={28} /></div>
              OPERATIONS COMMAND & ANALYTICS
            </h1>
            <p className="text-slate-500 text-sm ml-14 font-medium">Environmental Node • Real-time Monitoring & Flood Audit Hub</p>
          </div>
          
          <div className={`px-6 py-3 text-sm font-bold flex items-center gap-3 ${neuCard} rounded-full! py-2.5! 
            ${isFlooded ? "text-red-600 border-red-200" : isStormy ? "text-orange-600" : "text-emerald-600"}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isFlooded ? "bg-red-500 animate-ping" : isStormy ? "bg-orange-500" : "bg-emerald-500"}`}></div>
            {isFlooded ? "CRITICAL: FLOOD DETECTED" : isStormy ? "WARNING: STORM CONDITIONS" : "SYSTEM STABLE"}
          </div>
        </div>

        {/* METRICS GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <MetricCard title="Nhiệt độ" value={`${latestData.temperature.toFixed(1)}°C`} icon={<Thermometer size={20} className="text-rose-500" />} />
          <MetricCard title="Độ ẩm" value={`${latestData.humidity.toFixed(0)}%`} icon={<Droplets size={20} className="text-cyan-500" />} />
          <MetricCard title="Mực nước" value={`${latestData.water_level_cm.toFixed(1)} cm`} icon={<Activity size={20} className={isFlooded ? "text-red-500 animate-pulse" : "text-emerald-500"}/>} alert={isFlooded} />
          <MetricCard title="Sức gió" value={`${latestData.wind_speed_ms.toFixed(1)} m/s`} icon={<Wind size={20} className="text-slate-600" />} alert={latestData.wind_speed_ms > 10} />
          <MetricCard title="Lượng mưa" value={latestData.rain_status === 0 ? "Đang mưa" : "Tạnh ráo"} icon={<CloudRain size={20} className={latestData.rain_status === 0 ? "text-blue-600" : "text-slate-400"} />} />
          <MetricCard title="Áp suất" value={`${latestData.pressure.toFixed(0)} hPa`} icon={<Activity size={20} className="text-indigo-500" />} />
        </div>

        {/* CHARTS ROW 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className={`col-span-2 ${neuCard} flex flex-col`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-slate-700">BIẾN ĐỘNG MỰC NƯỚC & SỨC GIÓ</h2>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={[...historyData].reverse()} margin={{ top: 5, right: 0, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.5} />
                  <XAxis dataKey="created_at" tickFormatter={(t) => new Date(t).toLocaleTimeString("vi-VN", { hour: '2-digit', minute:'2-digit' })} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelFormatter={formatTimestampLabel} />
                  <Area yAxisId="left" type="monotone" dataKey="water_level_cm" name="Mực nước (cm)" stroke="#3b82f6" strokeWidth={3} fill="url(#colorWater)" />
                  <Bar yAxisId="right" dataKey="wind_speed_ms" name="Gió (m/s)" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={12} opacity={0.6} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${neuCard} flex flex-col`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Activity size={16} className="text-orange-500" /> LIVE ACTIVITY FEED
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {historyData.slice(0, 6).map((log, idx) => {
                const isFloodLog = log.water_level_cm >= 10;
                return (
                  <div key={idx} className="flex gap-4 items-start relative before:absolute before:left-3 before:top-8 before:-bottom-4 before:w-0.5 before:bg-slate-200 last:before:hidden">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${isFloodLog ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                      {isFloodLog ? <AlertCircle size={12} /> : <Droplets size={12} />}
                    </div>
                    <div className="flex flex-col pb-2">
                      <span className="text-xs font-bold text-slate-700">{isFloodLog ? "Cảnh báo ngập úng" : "Cập nhật dữ liệu trạm"}</span>
                      <span className="text-[11px] text-slate-500 mt-0.5">Mực nước: {log.water_level_cm.toFixed(1)}cm • Gió: {log.wind_speed_ms.toFixed(1)}m/s</span>
                      <span className="text-[10px] text-slate-400 mt-1">{new Date(log.created_at).toLocaleTimeString("vi-VN")}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* CHARTS ROW 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className={`col-span-2 ${neuCard} flex flex-col`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-slate-700">TƯƠNG QUAN NHIỆT ĐỘ & ĐỘ ẨM</h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...historyData].reverse()} margin={{ top: 5, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.5} />
                  <XAxis dataKey="created_at" tickFormatter={(t) => new Date(t).toLocaleTimeString("vi-VN", { hour: '2-digit', minute:'2-digit' })} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelFormatter={formatTimestampLabel} />
                  <Line yAxisId="left" type="monotone" dataKey="temperature" name="Nhiệt độ (°C)" stroke="#ef4444" strokeWidth={3} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="humidity" name="Độ ẩm (%)" stroke="#0ea5e9" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${neuCard} flex flex-col`}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-bold text-slate-700">CHỈ SỐ RỦI RO MÔI TRƯỜNG</h2>
            </div>
            <div className="h-64 w-full flex items-center justify-center -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Chỉ số (%)" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* MAP SECTION */}
        <div className={`${neuCard} flex flex-col h-112.5`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <MapPin size={18} className="text-blue-500" /> VỊ TRÍ TRẠM QUAN TRẮC THỰC TẾ
            </h2>
            <span className="text-xs font-medium text-slate-400">Cập nhật theo thời gian thực</span>
          </div>
          <div className="w-full flex-1 rounded-xl overflow-hidden shadow-inner border border-slate-200">
            <MapNode isFlooded={isFlooded} isStormy={isStormy} />
          </div>
        </div>

      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, alert }: { title: string, value: string, icon: React.ReactNode, alert?: boolean }) {
  return (
    <div className={`${neuCard} flex flex-col justify-between h-32 transition-colors ${alert ? 'border-red-400! bg-red-50!' : ''}`}>
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg shadow-[inset_2px_2px_4px_#d3d7de,inset_-2px_-2px_4px_#ffffff] ${alert ? 'animate-bounce bg-white' : 'bg-[#f4f7fb]'}`}>{icon}</div>
      </div>
      <div className={`text-2xl font-black tracking-tight ${alert ? 'text-red-600' : 'text-slate-700'}`}>{value}</div>
    </div>
  );
}