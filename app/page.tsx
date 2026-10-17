"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ComposedChart, Bar, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { 
  Droplets, Wind, Thermometer, CloudRain, Activity, AlertCircle, MapPin, SlidersHorizontal
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
  const [isAlertAcknowledged, setIsAlertAcknowledged] = useState(false);

  // States cho tính năng mô phỏng / điều chỉnh độ lụt thủ công
  const [manualInput, setManualInput] = useState<string>("");
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);
  const [currentManualTarget, setCurrentManualTarget] = useState<number | null>(null);
  const [manualStatusMsg, setManualStatusMsg] = useState<string>("");

  const formatTimestampLabel = (label: unknown) => {
    const raw = typeof label === "string" || typeof label === "number" || label instanceof Date
      ? label
      : String(label ?? "");
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(label ?? "") : date.toLocaleTimeString("vi-VN");
  };

  const fetchHistoryData = useCallback(async () => {
    // 1. Lấy dữ liệu quan trắc thực tế từ trạm (bỏ qua bản ghi lệnh có rain_status = -99)
    const { data } = await supabase
      .from("sensor_logs")
      .select("*")
      .eq("station_id", STATION_ID)
      .neq("rain_status", -99)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      setLatestData(data[0]);
      setHistoryData(data);
      if (data[0].water_level_cm < 20) setIsAlertAcknowledged(false);
    }

    // 2. Lấy mức độ lụt thủ công gần nhất đã được cấu hình từ Web
    const { data: manualData } = await supabase
      .from("sensor_logs")
      .select("water_level_cm")
      .eq("station_id", STATION_ID)
      .eq("rain_status", -99)
      .order("created_at", { ascending: false })
      .limit(1);

    if (manualData && manualData.length > 0 && manualData[0].water_level_cm >= 0) {
      const target = manualData[0].water_level_cm;
      setCurrentManualTarget(target);
      setManualInput(target.toString());
    } else {
      setCurrentManualTarget(null);
      setManualInput("");
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
          // Nếu là bản ghi lệnh điều khiển thủ công từ Web
          if (newData.rain_status === -99) {
            if (newData.water_level_cm >= 0) {
              setCurrentManualTarget(newData.water_level_cm);
              setManualInput(newData.water_level_cm.toString());
            } else {
              setCurrentManualTarget(null);
              setManualInput("");
            }
            return;
          }
          // Bản ghi dữ liệu quan trắc gửi từ thiết bị
          setLatestData(newData);
          setHistoryData((current) => [newData, ...current.filter(item => item.rain_status !== -99)].slice(0, 30));
          if (newData.water_level_cm < 20) setIsAlertAcknowledged(false);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistoryData]);

  // Giữ số hiển thị trên Web nhảy nhẹ quanh mức lụt mục tiêu (±0.1 đến ±0.3 cm) khi đang ở chế độ Theo Web
  useEffect(() => {
    if (currentManualTarget === null || currentManualTarget < 0) return;
    const interval = setInterval(() => {
      setLatestData((prev) => {
        if (!prev) return prev;
        // Rung nhẹ ngẫu nhiên quanh mức cơ sở
        const jitter = Math.round((Math.random() * 0.6 - 0.3) * 10) / 10;
        const newLevel = Math.max(0, Math.min(100, Number((currentManualTarget + jitter).toFixed(1))));
        return {
          ...prev,
          water_level_cm: newLevel
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentManualTarget]);

  // Hàm gửi mức độ lụt thủ công xuống hệ thống (Supabase & Hardware)
  const handleSetManualFlood = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = parseFloat(manualInput);
    if (isNaN(val) || val < 0 || val > 100) {
      setManualStatusMsg("Vui lòng nhập độ lụt hợp lệ từ 0 đến 100 cm!");
      return;
    }

    setIsSubmittingManual(true);
    setManualStatusMsg("Đang đồng bộ xuống trạm...");

    try {
      setCurrentManualTarget(val);
      setLatestData((prev) => prev ? { ...prev, water_level_cm: val } : null);

      // Gửi bản ghi lệnh có rain_status = -99 để thiết bị ESP32 nhận biết ngay lập tức
      const { error } = await supabase.from("sensor_logs").insert([{
        station_id: STATION_ID,
        water_level_cm: val,
        rain_status: -99,
        temperature: -999,
        humidity: 0,
        pressure: 0,
        light_lux: 0,
        wind_speed_ms: 0
      }]);

      if (error) {
        setManualStatusMsg("Lỗi gửi dữ liệu: " + error.message);
      } else {
        setManualStatusMsg(`Đã kích hoạt chế độ Theo Web: ${val.toFixed(1)} cm!`);
        setTimeout(() => setManualStatusMsg(""), 4000);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setManualStatusMsg("Lỗi: " + errorMsg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Hàm chuyển về chế độ cảm biến tự đo (bỏ đè theo Web)
  const handleResetToAuto = async () => {
    setIsSubmittingManual(true);
    setManualStatusMsg("Đang chuyển về chế độ cảm biến tự đo...");

    try {
      setCurrentManualTarget(null);
      setManualInput("");

      // Gửi bản ghi lệnh có water_level_cm = -1 để ESP32 chuyển sang đọc cảm biến siêu âm tự đo
      const { error } = await supabase.from("sensor_logs").insert([{
        station_id: STATION_ID,
        water_level_cm: -1,
        rain_status: -99,
        temperature: -999,
        humidity: 0,
        pressure: 0,
        light_lux: 0,
        wind_speed_ms: 0
      }]);

      if (error) {
        setManualStatusMsg("Lỗi: " + error.message);
      } else {
        setManualStatusMsg("Đã chuyển về chế độ cảm biến tự đo! Màn hình & Web đang nhận dữ liệu từ cảm biến.");
        setTimeout(() => setManualStatusMsg(""), 4000);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setManualStatusMsg("Lỗi: " + errorMsg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const isFlooded = latestData !== null && latestData.water_level_cm >= 20;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#eef2f6] text-slate-500 font-semibold">Đang tải dữ liệu không gian...</div>;
  if (!latestData) return <div className="min-h-screen flex items-center justify-center bg-[#eef2f6] text-slate-500">Chưa có dữ liệu từ trạm.</div>;

  const isStormy = latestData.wind_speed_ms > 15 && latestData.rain_status === 0;
  const previousData = historyData[1];
  const waterLevelChange = previousData ? latestData.water_level_cm - previousData.water_level_cm : null;
  const sampleIntervalMs = previousData
    ? new Date(latestData.created_at).getTime() - new Date(previousData.created_at).getTime()
    : 0;
  const waterLevelRate = waterLevelChange !== null && sampleIntervalMs > 0
    ? waterLevelChange / (sampleIntervalMs / 3_600_000)
    : null;
  const trendDescription = waterLevelChange === null || sampleIntervalMs <= 0
    ? "Chưa đủ dữ liệu hợp lệ để xác định xu hướng mực nước."
    : Math.abs(waterLevelChange) < 0.2
      ? `Mực nước gần như ổn định giữa hai lần đo gần nhất (${waterLevelChange >= 0 ? "+" : ""}${waterLevelChange.toFixed(1)} cm).`
      : `Mực nước ${waterLevelChange > 0 ? "đang tăng" : "đang giảm"} ${Math.abs(waterLevelChange).toFixed(1)} cm giữa hai lần đo gần nhất${waterLevelRate !== null ? ` (tốc độ đo được khoảng ${waterLevelRate > 0 ? "+" : ""}${waterLevelRate.toFixed(1)} cm/giờ)` : ""}.`;

  // Phân cấp mức độ ngập:
  // - Độ lụt nhỏ hơn 20: Không có cảnh báo
  // - Độ lụt từ 20 tới 50: Cảnh báo lụt nhẹ
  // - Độ lụt từ 50 trở lên: Cảnh báo lụt nặng
  const floodTier = latestData === null ? 0 :
    latestData.water_level_cm >= 50 ? 2 :
    latestData.water_level_cm >= 20 ? 1 : 0;

  const floodTierTitle = 
    floodTier === 2 ? "NGUY HIỂM: CẢNH BÁO LỤT NẶNG (≥ 50 cm)" :
    floodTier === 1 ? "CẢNH BÁO: LỤT NHẸ (20 - 50 cm)" : "AN TOÀN / KHÔNG CẢNH BÁO";

  // Xử lý dữ liệu cho Biểu đồ Radar (Tính theo % mức độ cực đoan)
  const radarData = [
    { subject: 'Ngập lụt', A: Math.min((latestData.water_level_cm / 50) * 100, 100), fullMark: 100 },
    { subject: 'Nhiệt độ', A: Math.min((latestData.temperature / 50) * 100, 100), fullMark: 100 },
    { subject: 'Sức gió', A: Math.min((latestData.wind_speed_ms / 30) * 100, 100), fullMark: 100 },
    { subject: 'Độ ẩm', A: latestData.humidity, fullMark: 100 },
    { subject: 'Ánh sáng', A: Math.min((latestData.light_lux / 100000) * 100, 100), fullMark: 100 },
  ];

  return (
    <div className={`min-h-screen bg-[#eef2f6] p-6 font-sans text-slate-700 md:p-10 ${isFlooded ? "flood-alert-active" : ""}`}>
      {isFlooded && (
        <div role="alert" aria-live="assertive" className="mx-auto mb-6 flex max-w-7xl flex-col items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-700 px-5 py-4 text-white shadow-lg sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-black uppercase">{floodTierTitle}</p>
              <p className="mt-1 text-sm text-red-50">Đang ghi nhận {latestData.water_level_cm.toFixed(1)} cm; ngưỡng cảnh báo ngập của hệ thống là 20 cm.</p>
            </div>
          </div>
          <button type="button" onClick={() => setIsAlertAcknowledged(false)} className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Xem chi tiết cảnh báo
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center">
            <h1 className="mb-2 flex items-center justify-center gap-3 text-3xl font-black tracking-tight text-slate-800">
              <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl shadow-inner"><Activity size={28} /></div>
              FLOOD ALERT SYSTEM
            </h1>
            <p className="text-sm font-medium text-slate-500">Real-time flood monitoring and alert system</p>
          </div>
          
          <div className={`flex items-center gap-3 px-6 py-3 text-sm font-bold ${neuCard} rounded-full! py-2.5!
            ${isFlooded ? "text-red-600 border-red-200" : isStormy ? "text-orange-600" : "text-emerald-600"}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isFlooded ? "bg-red-500 animate-ping" : isStormy ? "bg-orange-500" : "bg-emerald-500"}`}></div>
            {isFlooded ? floodTierTitle : isStormy ? "WARNING: STORM CONDITIONS" : "SYSTEM STABLE"}
          </div>
        </div>

        {isFlooded && !isAlertAcknowledged && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/65 px-4 pb-4 pt-10 backdrop-blur-sm" role="presentation">
            <section role="alertdialog" aria-modal="true" aria-labelledby="flood-alert-title" aria-describedby="flood-alert-description" className="max-h-[calc(100dvh-3.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-red-300 bg-white text-slate-800 shadow-2xl">
              <div className="bg-red-700 px-6 py-5 text-white sm:px-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-white/15 p-3"><AlertCircle size={30} aria-hidden="true" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-red-100">Cảnh báo khẩn cấp • Trạm quan trắc</p>
                    <h2 id="flood-alert-title" className="mt-1 text-2xl font-black">Nguy cơ ngập lụt nghiêm trọng</h2>
                    <p id="flood-alert-description" className="mt-2 text-sm text-red-50">Mực nước đã chạm/vượt ngưỡng cảnh báo được cấu hình. Hãy ưu tiên an toàn cá nhân và kiểm tra các chỉ số dưới đây.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-6 sm:p-8">
                <section aria-labelledby="flood-readings-title">
                  <h3 id="flood-readings-title" className="text-sm font-black uppercase tracking-wide text-slate-500">Thông số mới nhất</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <AlertReading label="Mực nước" value={`${latestData.water_level_cm.toFixed(1)} cm`} critical />
                    <AlertReading label="Mưa" value={latestData.rain_status === 0 ? "Đang mưa" : "Không ghi nhận mưa"} />
                    <AlertReading label="Sức gió" value={`${latestData.wind_speed_ms.toFixed(1)} m/s`} />
                    <AlertReading label="Nhiệt độ" value={`${latestData.temperature.toFixed(1)} °C`} />
                    <AlertReading label="Độ ẩm" value={`${latestData.humidity.toFixed(0)}%`} />
                    <AlertReading label="Áp suất" value={`${latestData.pressure.toFixed(0)} hPa`} />
                    <AlertReading label="Ánh sáng" value={`${latestData.light_lux.toFixed(0)} lux`} />
                    <AlertReading label="Ngưỡng hệ thống" value="20 cm" />
                    <AlertReading label="Thời điểm đo" value={new Date(latestData.created_at).toLocaleString("vi-VN")} />
                  </dl>
                </section>

                <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="flood-trend-title">
                  <h3 id="flood-trend-title" className="font-bold text-amber-950">Xu hướng quan sát, không phải dự báo</h3>
                  <p className="mt-1 text-sm leading-6 text-amber-900">{trendDescription}</p>
                  <p className="mt-2 text-xs leading-5 text-amber-800">Ước tính chỉ dựa trên hai bản ghi cảm biến gần nhất; không thay thế dự báo thủy văn hoặc hướng dẫn của cơ quan chức năng.</p>
                </section>

                <section aria-labelledby="flood-actions-title">
                  <h3 id="flood-actions-title" className="text-sm font-black uppercase tracking-wide text-slate-500">Hướng xử lý an toàn</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:font-bold marker:text-red-700">
                    <li>Rời khu vực thấp trũng nếu nước tiếp tục dâng; di chuyển đến nơi cao, kiên cố và đi theo hướng dẫn sơ tán tại địa phương.</li>
                    <li>Không đi bộ, đi xe qua dòng nước ngập; tránh xa cống/rãnh, dây điện rơi và thiết bị điện bị ướt.</li>
                    <li>Đưa trẻ em, người cao tuổi và người cần hỗ trợ đến nơi an toàn; mang theo điện thoại, thuốc thiết yếu và giấy tờ quan trọng nếu có thời gian.</li>
                    <li>Theo dõi thông báo chính thức và liên hệ lực lượng cứu hộ/cơ quan khẩn cấp địa phương khi có nguy hiểm tức thời.</li>
                  </ol>
                </section>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setIsAlertAcknowledged(true)} className="rounded-lg bg-red-700 px-5 py-3 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                    Đã xem, tiếp tục theo dõi
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

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
                const isFloodLog = log.water_level_cm >= 20;
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

        {/* Ô ĐIỀU CHỈNH / ĐÈ ĐỘ LỤT (TỰ ĐO BẰNG CẢM BIẾN, KHI NHẬP TRÊN WEB THÌ THEO WEB) */}
        <div className={`${neuCard} flex flex-col md:flex-row items-center justify-between gap-4 border border-blue-200/60 bg-gradient-to-r from-blue-50/50 via-[#f4f7fb] to-indigo-50/50`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 shadow-inner">
              <SlidersHorizontal size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Điều khiển độ lụt
                </h3>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${currentManualTarget !== null ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-emerald-100 text-emerald-700 border border-emerald-300"}`}>
                  {currentManualTarget !== null ? `Đang theo Web: ${currentManualTarget.toFixed(1)} cm` : "Đang cảm biến tự đo"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Mặc định hệ thống tự đo bằng cảm biến siêu âm. Lúc nào nhập số vào ô bên cạnh thì màn hình & Web sẽ chạy theo số Web.
              </p>
            </div>
          </div>

          <form onSubmit={handleSetManualFlood} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-36">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Độ lụt (cm)"
                className="w-full px-3.5 py-2 text-sm font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800"
              />
              <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">cm</span>
            </div>
            <button
              type="submit"
              disabled={isSubmittingManual}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-150 disabled:opacity-50 shrink-0 cursor-pointer"
            >
              {isSubmittingManual ? "..." : "Theo Web"}
            </button>
            {currentManualTarget !== null && (
              <button
                type="button"
                onClick={handleResetToAuto}
                disabled={isSubmittingManual}
                className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-xl shadow transition-all duration-150 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                Về tự đo
              </button>
            )}
          </form>
        </div>
        {manualStatusMsg && (
          <p className="text-xs font-semibold text-center text-blue-600 -mt-4">
            {manualStatusMsg}
          </p>
        )}

      </div>
    </div>
  );
}

function AlertReading({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${critical ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-black ${critical ? "text-red-700" : "text-slate-800"}`}>{value}</dd>
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