"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
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

export default function MapNode({ lat = 10.779393260402657, lng = 106.6801167937429, isFlooded = false, isStormy = false }) {
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
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        subdomains={['a', 'b', 'c']}
      />
      <Marker position={[lat, lng]} icon={markerIcon}>
        <Popup>
          <div className="font-sans">
            <strong className="text-slate-800">Trạm Quan Trắc Trung Tâm</strong><br />
            <span className="text-slate-500">Trạng thái: <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</span></span>
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