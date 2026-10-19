"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ComposedChart, Bar, Area, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { 
  Droplets, Wind, Thermometer, CloudRain, Activity, AlertCircle, MapPin, SlidersHorizontal, RotateCcw, Check, Settings, X, RefreshCw
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

  // States cho tính năng đè / tùy chỉnh thông số toàn diện
  const [overrides, setOverrides] = useState<{
    water_level_cm: number | null;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    wind_speed_ms: number | null;
    light_lux: number | null;
    rain_status: "auto" | "rain" | "no_rain";
  }>({
    water_level_cm: null,
    temperature: null,
    humidity: null,
    pressure: null,
    wind_speed_ms: null,
    light_lux: null,
    rain_status: "auto",
  });

  const [inputValues, setInputValues] = useState<{
    water_level_cm: string;
    temperature: string;
    humidity: string;
    pressure: string;
    wind_speed_ms: string;
    light_lux: string;
    rain_status: "auto" | "rain" | "no_rain";
  }>({
    water_level_cm: "",
    temperature: "",
    humidity: "",
    pressure: "",
    wind_speed_ms: "",
    light_lux: "",
    rain_status: "auto",
  });

  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);
  const [manualStatusMsg, setManualStatusMsg] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // States vị trí thực tế của thiết bị trạm quan trắc trên bản đồ
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number }>({
    lat: 10.7684512638001,
    lng: 106.706217892206,
  });
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationStatusMsg, setLocationStatusMsg] = useState<string>("");

  const formatTimestampLabel = (label: unknown) => {
    const raw = typeof label === "string" || typeof label === "number" || label instanceof Date
      ? label
      : String(label ?? "");
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(label ?? "") : date.toLocaleTimeString("vi-VN");
  };

  const fetchHistoryData = useCallback(async () => {
    // 1. Lấy dữ liệu quan trắc thực tế từ trạm (bỏ qua bản ghi lệnh có rain_status < 0)
    const { data } = await supabase
      .from("sensor_logs")
      .select("*")
      .eq("station_id", STATION_ID)
      .gte("rain_status", 0)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      setLatestData(data[0]);
      setHistoryData(data);
      if (data[0].water_level_cm < 20) setIsAlertAcknowledged(false);
    }

    // 2. Lấy lệnh tùy chỉnh thông số gần nhất đã được cấu hình từ Web
    const { data: cmdData } = await supabase
      .from("sensor_logs")
      .select("*")
      .eq("station_id", STATION_ID)
      .lt("rain_status", 0)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cmdData && cmdData.length > 0) {
      const cmd = cmdData[0];
      const parsedOvr = {
        water_level_cm: cmd.water_level_cm >= 0 && cmd.water_level_cm <= 100 ? cmd.water_level_cm : null,
        temperature: cmd.temperature > -500 && cmd.temperature < 100 ? cmd.temperature : null,
        humidity: cmd.humidity >= 0 && cmd.humidity <= 100 ? cmd.humidity : null,
        pressure: cmd.pressure > 500 && cmd.pressure < 1300 ? cmd.pressure : null,
        wind_speed_ms: cmd.wind_speed_ms >= 0 && cmd.wind_speed_ms < 100 ? cmd.wind_speed_ms : null,
        light_lux: cmd.light_lux >= 0 ? cmd.light_lux : null,
        rain_status: cmd.rain_status === -98 ? ("rain" as const) : cmd.rain_status === -97 ? ("no_rain" as const) : ("auto" as const),
      };
      setOverrides(parsedOvr);
      setInputValues({
        water_level_cm: parsedOvr.water_level_cm !== null ? parsedOvr.water_level_cm.toString() : "",
        temperature: parsedOvr.temperature !== null ? parsedOvr.temperature.toString() : "",
        humidity: parsedOvr.humidity !== null ? parsedOvr.humidity.toString() : "",
        pressure: parsedOvr.pressure !== null ? parsedOvr.pressure.toString() : "",
        wind_speed_ms: parsedOvr.wind_speed_ms !== null ? parsedOvr.wind_speed_ms.toString() : "",
        light_lux: parsedOvr.light_lux !== null ? parsedOvr.light_lux.toString() : "",
        rain_status: parsedOvr.rain_status,
      });
    }

    // 3. Lấy tọa độ trạm quan trắc từ bảng stations hoặc localStorage
    if (typeof window !== "undefined") {
      try {
        const savedLoc = localStorage.getItem("flood_station_location");
        if (savedLoc) {
          const parsed = JSON.parse(savedLoc);
          if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
            setDeviceLocation({ lat: parsed.lat, lng: parsed.lng });
          }
        }
      } catch {
        // ignore
      }
    }

    const { data: stationData } = await supabase
      .from("stations")
      .select("lat, lng")
      .eq("id", STATION_ID)
      .single();

    if (stationData && typeof stationData.lat === "number" && typeof stationData.lng === "number") {
      if (typeof window !== "undefined" && !localStorage.getItem("flood_station_location")) {
        setDeviceLocation({ lat: stationData.lat, lng: stationData.lng });
      }
    }

    setLoading(false);
  }, []);

  // Hàm làm mới và cập nhật vị trí thiết bị trạm quan trắc
  const handleRefreshLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatusMsg("Trình duyệt không hỗ trợ Geolocation GPS.");
      setTimeout(() => setLocationStatusMsg(""), 4000);
      return;
    }

    setIsLocating(true);
    setLocationStatusMsg("Đang lấy tọa độ GPS từ thiết bị...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDeviceLocation({ lat, lng });

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("flood_station_location", JSON.stringify({ lat, lng }));
          } catch {
            // ignore
          }
        }

        try {
          await supabase.from("stations").update({ lat, lng }).eq("id", STATION_ID);
        } catch {
          // ignore
        }

        setIsLocating(false);
        setLocationStatusMsg(`Đã cập nhật vị trí thiết bị (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        setTimeout(() => setLocationStatusMsg(""), 5000);
      },
      async (err) => {
        console.warn("Geolocation error:", err.message);
        try {
          const { data: stationData } = await supabase
            .from("stations")
            .select("lat, lng")
            .eq("id", STATION_ID)
            .single();

          if (stationData && typeof stationData.lat === "number" && typeof stationData.lng === "number") {
            setDeviceLocation({ lat: stationData.lat, lng: stationData.lng });
            setLocationStatusMsg(`Đã tải tọa độ lưu trạm (${stationData.lat.toFixed(4)}, ${stationData.lng.toFixed(4)})`);
          } else {
            setLocationStatusMsg("Không thể lấy vị trí. Vui lòng cho phép quyền truy cập vị trí trên trình duyệt.");
          }
        } catch {
          setLocationStatusMsg("Không thể xác định vị trí. Vui lòng bật GPS trình duyệt.");
        }
        setIsLocating(false);
        setTimeout(() => setLocationStatusMsg(""), 6000);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
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
          // Nếu là bản ghi lệnh điều khiển thủ công từ Web (rain_status < 0)
          if (newData.rain_status < 0) {
            const parsedOvr = {
              water_level_cm: newData.water_level_cm >= 0 && newData.water_level_cm <= 100 ? newData.water_level_cm : null,
              temperature: newData.temperature > -500 && newData.temperature < 100 ? newData.temperature : null,
              humidity: newData.humidity >= 0 && newData.humidity <= 100 ? newData.humidity : null,
              pressure: newData.pressure > 500 && newData.pressure < 1300 ? newData.pressure : null,
              wind_speed_ms: newData.wind_speed_ms >= 0 && newData.wind_speed_ms < 100 ? newData.wind_speed_ms : null,
              light_lux: newData.light_lux >= 0 ? newData.light_lux : null,
              rain_status: newData.rain_status === -98 ? ("rain" as const) : newData.rain_status === -97 ? ("no_rain" as const) : ("auto" as const),
            };
            setOverrides(parsedOvr);
            setInputValues({
              water_level_cm: parsedOvr.water_level_cm !== null ? parsedOvr.water_level_cm.toString() : "",
              temperature: parsedOvr.temperature !== null ? parsedOvr.temperature.toString() : "",
              humidity: parsedOvr.humidity !== null ? parsedOvr.humidity.toString() : "",
              pressure: parsedOvr.pressure !== null ? parsedOvr.pressure.toString() : "",
              wind_speed_ms: parsedOvr.wind_speed_ms !== null ? parsedOvr.wind_speed_ms.toString() : "",
              light_lux: parsedOvr.light_lux !== null ? parsedOvr.light_lux.toString() : "",
              rain_status: parsedOvr.rain_status,
            });
            return;
          }

          // Bản ghi dữ liệu quan trắc gửi từ thiết bị
          setLatestData(newData);
          setHistoryData((current) => [newData, ...current.filter(item => item.rain_status >= 0)].slice(0, 30));
          if (newData.water_level_cm < 20) setIsAlertAcknowledged(false);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistoryData]);

  // Giữ số hiển thị trên Web nhảy nhẹ quanh mức mục tiêu cho các thông số đang được đè từ Web
  useEffect(() => {
    const hasAny = Object.entries(overrides).some(([k, v]) => k === "rain_status" ? v !== "auto" : v !== null);
    if (!hasAny) return;

    const interval = setInterval(() => {
      setLatestData((prev) => {
        if (!prev) return prev;
        let { water_level_cm, temperature, humidity, pressure, wind_speed_ms, light_lux, rain_status } = prev;

        if (overrides.water_level_cm !== null) {
          const j = Math.round((Math.random() * 0.6 - 0.3) * 10) / 10;
          water_level_cm = Math.max(0, Math.min(100, Number((overrides.water_level_cm + j).toFixed(1))));
        }
        if (overrides.temperature !== null) {
          const j = Math.round((Math.random() * 0.4 - 0.2) * 10) / 10;
          temperature = Number((overrides.temperature + j).toFixed(1));
        }
        if (overrides.humidity !== null) {
          const j = Math.round((Math.random() * 1.0 - 0.5) * 10) / 10;
          humidity = Math.max(0, Math.min(100, Number((overrides.humidity + j).toFixed(1))));
        }
        if (overrides.pressure !== null) {
          const j = Math.round((Math.random() * 0.6 - 0.3) * 10) / 10;
          pressure = Number((overrides.pressure + j).toFixed(1));
        }
        if (overrides.wind_speed_ms !== null) {
          const j = Math.round((Math.random() * 0.4 - 0.2) * 10) / 10;
          wind_speed_ms = Math.max(0, Number((overrides.wind_speed_ms + j).toFixed(1)));
        }
        if (overrides.light_lux !== null) {
          const j = Math.round(Math.random() * 10 - 5);
          light_lux = Math.max(0, overrides.light_lux + j);
        }
        if (overrides.rain_status !== "auto") {
          rain_status = overrides.rain_status === "rain" ? 0 : 1;
        }

        return {
          ...prev,
          water_level_cm,
          temperature,
          humidity,
          pressure,
          wind_speed_ms,
          light_lux,
          rain_status
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [overrides]);

  // Hàm áp dụng cấu hình tùy chỉnh xuống Supabase & Hardware
  const handleApplyOverrides = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmittingManual(true);
    setManualStatusMsg("Đang đồng bộ cấu hình tùy chỉnh xuống trạm...");

    try {
      const parsedWater = inputValues.water_level_cm.trim() !== "" ? parseFloat(inputValues.water_level_cm) : null;
      const parsedTemp = inputValues.temperature.trim() !== "" ? parseFloat(inputValues.temperature) : null;
      const parsedHum = inputValues.humidity.trim() !== "" ? parseFloat(inputValues.humidity) : null;
      const parsedPress = inputValues.pressure.trim() !== "" ? parseFloat(inputValues.pressure) : null;
      const parsedWind = inputValues.wind_speed_ms.trim() !== "" ? parseFloat(inputValues.wind_speed_ms) : null;
      const parsedLux = inputValues.light_lux.trim() !== "" ? parseFloat(inputValues.light_lux) : null;

      const newOvr = {
        water_level_cm: parsedWater !== null && !isNaN(parsedWater) ? parsedWater : null,
        temperature: parsedTemp !== null && !isNaN(parsedTemp) ? parsedTemp : null,
        humidity: parsedHum !== null && !isNaN(parsedHum) ? parsedHum : null,
        pressure: parsedPress !== null && !isNaN(parsedPress) ? parsedPress : null,
        wind_speed_ms: parsedWind !== null && !isNaN(parsedWind) ? parsedWind : null,
        light_lux: parsedLux !== null && !isNaN(parsedLux) ? parsedLux : null,
        rain_status: inputValues.rain_status,
      };

      setOverrides(newOvr);

      // Mã hóa rain_status: -98 = Mưa, -97 = Tạnh, -99 = Tự đo
      let rainCode = -99;
      if (newOvr.rain_status === "rain") rainCode = -98;
      else if (newOvr.rain_status === "no_rain") rainCode = -97;

      const { error } = await supabase.from("sensor_logs").insert([{
        station_id: STATION_ID,
        water_level_cm: newOvr.water_level_cm !== null ? newOvr.water_level_cm : -999,
        temperature: newOvr.temperature !== null ? newOvr.temperature : -999,
        humidity: newOvr.humidity !== null ? newOvr.humidity : -999,
        pressure: newOvr.pressure !== null ? newOvr.pressure : -999,
        wind_speed_ms: newOvr.wind_speed_ms !== null ? newOvr.wind_speed_ms : -999,
        light_lux: newOvr.light_lux !== null ? newOvr.light_lux : -999,
        rain_status: rainCode,
      }]);

      if (error) {
        setManualStatusMsg("Lỗi gửi dữ liệu: " + error.message);
      } else {
        setManualStatusMsg("Đã đồng bộ cấu hình thành công! Màn hình & Web đang hiển thị theo cấu hình.");
        setTimeout(() => setManualStatusMsg(""), 4000);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setManualStatusMsg("Lỗi: " + errorMsg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Hàm đặt lại tất cả về chế độ cảm biến tự đo
  const handleResetAllToAuto = async () => {
    setIsSubmittingManual(true);
    setManualStatusMsg("Đang chuyển tất cả thông số về cảm biến tự đo...");

    try {
      setOverrides({
        water_level_cm: null,
        temperature: null,
        humidity: null,
        pressure: null,
        wind_speed_ms: null,
        light_lux: null,
        rain_status: "auto",
      });
      setInputValues({
        water_level_cm: "",
        temperature: "",
        humidity: "",
        pressure: "",
        wind_speed_ms: "",
        light_lux: "",
        rain_status: "auto",
      });

      const { error } = await supabase.from("sensor_logs").insert([{
        station_id: STATION_ID,
        water_level_cm: -999,
        temperature: -999,
        humidity: -999,
        pressure: -999,
        wind_speed_ms: -999,
        light_lux: -999,
        rain_status: -99,
      }]);

      if (error) {
        setManualStatusMsg("Lỗi: " + error.message);
      } else {
        setManualStatusMsg("Đã chuyển tất cả thông số về cảm biến tự đo thành công!");
        setTimeout(() => setManualStatusMsg(""), 4000);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setManualStatusMsg("Lỗi: " + errorMsg);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const hasAnyOverride = Object.entries(overrides).some(([k, v]) => k === "rain_status" ? v !== "auto" : v !== null);
  const overrideCount = [
    overrides.water_level_cm !== null,
    overrides.temperature !== null,
    overrides.humidity !== null,
    overrides.pressure !== null,
    overrides.wind_speed_ms !== null,
    overrides.light_lux !== null,
    overrides.rain_status !== "auto"
  ].filter(Boolean).length;

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
          
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className={`flex items-center gap-3 px-6 py-3 text-sm font-bold ${neuCard} rounded-full! py-2.5!
              ${isFlooded ? "text-red-600 border-red-200" : isStormy ? "text-orange-600" : "text-emerald-600"}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${isFlooded ? "bg-red-500 animate-ping" : isStormy ? "bg-orange-500" : "bg-emerald-500"}`}></div>
              {isFlooded ? floodTierTitle : isStormy ? "WARNING: STORM CONDITIONS" : "SYSTEM STABLE"}
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-full bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 shadow-md transition-all active:scale-95 cursor-pointer"
              title="Mở bảng tùy chỉnh thông số"
            >
              <Settings size={16} className={hasAnyOverride ? "text-amber-500" : "text-slate-600"} />
              <span></span>
              {hasAnyOverride && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black leading-none">
                  {overrideCount}
                </span>
              )}
            </button>
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
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <MapPin size={18} className="text-blue-500" /> VỊ TRÍ TRẠM QUAN TRẮC THỰC TẾ
              </h2>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md hidden sm:inline">
                {deviceLocation.lat.toFixed(5)}, {deviceLocation.lng.toFixed(5)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {locationStatusMsg && (
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  {locationStatusMsg}
                </span>
              )}
              <button
                type="button"
                onClick={handleRefreshLocation}
                disabled={isLocating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title="Làm mới vị trí bản đồ theo tọa độ thiết bị"
              >
                <RefreshCw size={13} className={isLocating ? "animate-spin text-blue-600" : "text-slate-500"} />
                <span>{isLocating ? "Đang định vị..." : "Làm mới vị trí"}</span>
              </button>
            </div>
          </div>
          <div className="w-full flex-1 rounded-xl overflow-hidden shadow-inner border border-slate-200">
            <MapNode lat={deviceLocation.lat} lng={deviceLocation.lng} isFlooded={isFlooded} isStormy={isStormy} />
          </div>
        </div>

        {/* NÚT BÁNH RĂNG CỐ ĐỊNH (FAB) ĐỂ MỞ BẢNG TÙY CHỈNH THÔNG SỐ */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full shadow-2xl transition-all duration-200 cursor-pointer group"
          title="Tùy chỉnh thông số hệ thống"
        >
          <Settings size={22} className="group-hover:rotate-90 transition-transform duration-300" />
          <span className="text-xs font-bold tracking-wide"></span>
          {hasAnyOverride && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-900 text-[10px] font-black shadow">
              {overrideCount}
            </span>
          )}
        </button>

        {/* MODAL BẢNG ĐIỀU KHIỂN & ĐÈ THÔNG SỐ TOÀN DIỆN */}
        {isSettingsOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div 
              className="relative w-full max-w-4xl bg-[#f4f7fb] rounded-3xl shadow-2xl border border-white/90 p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 shadow-inner">
                    <SlidersHorizontal size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                        Tùy chỉnh thông số hệ thống
                      </h3>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        hasAnyOverride 
                          ? "bg-amber-100 text-amber-700 border border-amber-300" 
                          : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      }`}>
                        {hasAnyOverride ? `Đang tùy chỉnh ${overrideCount}/7 thông số` : "Tất cả thông số đang tự đo"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Nhập giá trị để trạm & web chạy theo số web. Để trống hoặc chọn &quot;Cảm biến tự đo&quot; để chạy theo cảm biến thực tế.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                  {hasAnyOverride && (
                    <button
                      type="button"
                      onClick={handleResetAllToAuto}
                      disabled={isSubmittingManual}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 text-xs font-bold rounded-xl shadow transition-all duration-150 disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw size={14} /> Tự đo tất cả
                    </button>
                  )}
                  {/* Nút X để ẩn bảng */}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition-all cursor-pointer"
                    title="Ẩn bảng tùy chỉnh"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleApplyOverrides} className="flex flex-col gap-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {/* 1. Mực nước / Độ lụt */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Mực nước</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.water_level_cm !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.water_level_cm !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={inputValues.water_level_cm}
                        onChange={(e) => setInputValues(prev => ({ ...prev, water_level_cm: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-7"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">cm</span>
                    </div>
                  </div>

                  {/* 2. Nhiệt độ */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Nhiệt độ</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.temperature !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.temperature !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="-40"
                        max="80"
                        value={inputValues.temperature}
                        onChange={(e) => setInputValues(prev => ({ ...prev, temperature: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-7"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">°C</span>
                    </div>
                  </div>

                  {/* 3. Độ ẩm */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Độ ẩm</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.humidity !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.humidity !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={inputValues.humidity}
                        onChange={(e) => setInputValues(prev => ({ ...prev, humidity: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-7"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">%</span>
                    </div>
                  </div>

                  {/* 4. Sức gió */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Sức gió</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.wind_speed_ms !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.wind_speed_ms !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="50"
                        value={inputValues.wind_speed_ms}
                        onChange={(e) => setInputValues(prev => ({ ...prev, wind_speed_ms: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-8"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">m/s</span>
                    </div>
                  </div>

                  {/* 5. Áp suất */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Áp suất</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.pressure !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.pressure !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="800"
                        max="1200"
                        value={inputValues.pressure}
                        onChange={(e) => setInputValues(prev => ({ ...prev, pressure: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-8"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">hPa</span>
                    </div>
                  </div>

                  {/* 6. Ánh sáng */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Ánh sáng</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.light_lux !== null ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.light_lux !== null ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="10"
                        min="0"
                        max="100000"
                        value={inputValues.light_lux}
                        onChange={(e) => setInputValues(prev => ({ ...prev, light_lux: e.target.value }))}
                        placeholder="Tự đo"
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800 pr-7"
                      />
                      <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400">lx</span>
                    </div>
                  </div>

                  {/* 7. Lượng mưa */}
                  <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Mưa</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${overrides.rain_status !== "auto" ? "bg-amber-200 text-amber-800" : "text-slate-400"}`}>
                        {overrides.rain_status !== "auto" ? "Theo Web" : "Tự đo"}
                      </span>
                    </label>
                    <select
                      value={inputValues.rain_status}
                      onChange={(e) => setInputValues(prev => ({ ...prev, rain_status: e.target.value as "auto" | "rain" | "no_rain" }))}
                      className="w-full px-2 py-2 text-xs font-bold bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-slate-800"
                    >
                      <option value="auto">Cảm biến tự đo</option>
                      <option value="rain">Đang mưa (Đè)</option>
                      <option value="no_rain">Tạnh ráo (Đè)</option>
                    </select>
                  </div>
                </div>

                {manualStatusMsg && (
                  <p className="text-xs font-bold text-center text-blue-600 bg-blue-50 py-2.5 rounded-xl border border-blue-200">
                    {manualStatusMsg}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
                  <span className="text-xs text-slate-500 text-center sm:text-left">
                    Mẹo: Xóa trống ô của thông số nào thì thông số đó sẽ lập tức chuyển về tự đo bằng cảm biến thật.
                  </span>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(false)}
                      className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Ẩn bảng
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingManual}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all duration-150 disabled:opacity-50 cursor-pointer justify-center"
                    >
                      <Check size={16} /> {isSubmittingManual ? "Đang gửi..." : "Áp dụng cấu hình"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
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