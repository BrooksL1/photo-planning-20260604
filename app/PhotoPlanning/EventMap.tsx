"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { destinationPoint } from "./lib/geo";

// Leaflet's default marker icon paths break under bundlers unless pointed at
// hosted assets explicitly.
const pinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function arrowheadIcon(bearingDeg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="transform: rotate(${bearingDeg}deg); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 16px solid #6366f1;"></div>`,
    iconSize: [14, 16],
    iconAnchor: [7, 8],
  });
}

function FitToBounds({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export default function EventMap({
  pinLat,
  pinLng,
  bearingDeg,
  onPinMove,
}: {
  pinLat: number;
  pinLng: number;
  // Omitted for events with no direction (meteor showers, eclipses): the
  // map then just frames the pin, with no arrow.
  bearingDeg?: number;
  onPinMove: (lat: number, lng: number) => void;
}) {
  const tip = bearingDeg != null ? destinationPoint(pinLat, pinLng, bearingDeg, 20) : null;
  const corners =
    bearingDeg != null
      ? [destinationPoint(pinLat, pinLng, bearingDeg + 180, 10), destinationPoint(pinLat, pinLng, bearingDeg, 30)]
      : [destinationPoint(pinLat, pinLng, 225, 14), destinationPoint(pinLat, pinLng, 45, 14)];

  const bounds: [[number, number], [number, number]] = [
    [Math.min(corners[0].lat, corners[1].lat), Math.min(corners[0].lng, corners[1].lng)],
    [Math.max(corners[0].lat, corners[1].lat), Math.max(corners[0].lng, corners[1].lng)],
  ];

  return (
    <MapContainer
      center={[pinLat, pinLng]}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: 150, width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitToBounds bounds={bounds} />
      <Marker
        position={[pinLat, pinLng]}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = (e.target as L.Marker).getLatLng();
            onPinMove(pos.lat, pos.lng);
          },
        }}
      />
      {tip && bearingDeg != null && (
        <>
          <Polyline
            positions={[
              [pinLat, pinLng],
              [tip.lat, tip.lng],
            ]}
            pathOptions={{ color: "#6366f1", weight: 3 }}
          />
          <Marker position={[tip.lat, tip.lng]} icon={arrowheadIcon(bearingDeg)} />
        </>
      )}
    </MapContainer>
  );
}
