"use client";

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createStatusIcon = (statusColor: string) =>
  L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        background: ${statusColor};
        border: 3px solid rgba(255,255,255,0.9);
        box-shadow: 0 0 0 4px ${statusColor}33, 0 10px 16px rgba(15,23,42,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      "></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -18],
  });

// Component điều khiển nhảy thẳng đến vị trí mới ngay lập tức (không lướt, không animation, không rung lắc)
function JumpToView({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prevCoordsRef = useRef<{ lat: number; lng: number }>({ lat, lng });

  useEffect(() => {
    // Chỉ nhảy camera khi tọa độ lat hoặc lng thực sự thay đổi giá trị
    const hasChanged = 
      Math.abs(prevCoordsRef.current.lat - lat) > 0.00001 ||
      Math.abs(prevCoordsRef.current.lng - lng) > 0.00001;

    if (hasChanged) {
      prevCoordsRef.current = { lat, lng };
      // Nhảy thẳng tới vị trí mới ngay lập tức, tắt hoàn toàn animation để không bị rung
      map.setView([lat, lng], map.getZoom() || 15, { animate: false });
    }
  }, [lat, lng, map]);

  return null;
}

interface MapNodeProps {
  lat?: number;
  lng?: number;
  isFlooded?: boolean;
  isStormy?: boolean;
}

export default function MapNode({ 
  lat = 10.7684512638001, 
  lng = 106.706217892206, 
  isFlooded = false, 
  isStormy = false 
}: MapNodeProps) {
  const statusColor = isFlooded ? '#ef4444' : isStormy ? '#f97316' : '#10b981';
  const statusText = isFlooded ? 'Ngập úng khẩn cấp' : isStormy ? 'Cảnh báo mưa bão' : 'An toàn';
  const markerIcon = createStatusIcon(statusColor);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%', borderRadius: '1rem', zIndex: 0 }}
    >
      <JumpToView lat={lat} lng={lng} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        subdomains={['a', 'b', 'c']}
      />
      <Marker position={[lat, lng]} icon={markerIcon}>
        <Popup>
          <div className="font-sans text-xs space-y-1">
            <strong className="text-slate-800 text-sm">Vị Trí Thiết Bị Trạm Quan Trắc</strong>
            <div>
              <span className="text-slate-500">Tọa độ: </span>
              <span className="font-mono font-bold text-slate-700">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
            </div>
            <div>
              <span className="text-slate-500">Trạng thái: </span>
              <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</span>
            </div>
          </div>
        </Popup>
      </Marker>
      <Circle
        center={[lat, lng]}
        radius={250}
        pathOptions={{ color: statusColor, fillColor: statusColor, fillOpacity: 0.15, weight: 2 }}
      />
    </MapContainer>
  );
}