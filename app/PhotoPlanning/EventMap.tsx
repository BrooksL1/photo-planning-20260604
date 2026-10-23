"use client";

import { useEffect } from "react";
import { APIProvider, AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { destinationPoint } from "./lib/geo";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// AdvancedMarker requires a map ID. DEMO_MAP_ID works without cloud styling;
// set NEXT_PUBLIC_GOOGLE_MAP_ID to use a styled map from Google Cloud.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID";

const LINE_COLOR = "#6366f1";

function Arrowhead({ bearingDeg }: { bearingDeg: number }) {
  return (
    <div
      style={{
        transform: `rotate(${bearingDeg}deg)`,
        width: 0,
        height: 0,
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderBottom: `16px solid ${LINE_COLOR}`,
      }}
    />
  );
}

// The Maps JS API has no declarative polyline; draw it on the map instance.
function DirectionLine({ fromLat, fromLng, toLat, toLng }: { fromLat: number; fromLng: number; toLat: number; toLng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline({
      map,
      path: [
        { lat: fromLat, lng: fromLng },
        { lat: toLat, lng: toLng },
      ],
      strokeColor: LINE_COLOR,
      strokeWeight: 3,
      clickable: false,
    });
    return () => line.setMap(null);
  }, [map, fromLat, fromLng, toLat, toLng]);
  return null;
}

function FitToBounds({ bounds }: { bounds: google.maps.LatLngBoundsLiteral }) {
  const map = useMap();
  const { south, west, north, east } = bounds;
  useEffect(() => {
    map?.fitBounds({ south, west, north, east }, 24);
  }, [map, south, west, north, east]);
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
  const pin = { lat: pinLat, lng: pinLng };
  const tip = bearingDeg != null ? destinationPoint(pinLat, pinLng, bearingDeg, 20) : null;
  const corners =
    bearingDeg != null
      ? [destinationPoint(pinLat, pinLng, bearingDeg + 180, 10), destinationPoint(pinLat, pinLng, bearingDeg, 30)]
      : [destinationPoint(pinLat, pinLng, 225, 14), destinationPoint(pinLat, pinLng, 45, 14)];

  const bounds: google.maps.LatLngBoundsLiteral = {
    south: Math.min(corners[0].lat, corners[1].lat),
    west: Math.min(corners[0].lng, corners[1].lng),
    north: Math.max(corners[0].lat, corners[1].lat),
    east: Math.max(corners[0].lng, corners[1].lng),
  };

  if (!API_KEY) {
    return (
      <div style={{ height: 150, width: "100%" }} className="flex items-center justify-center text-xs text-zinc-500">
        Map unavailable: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        mapId={MAP_ID}
        defaultCenter={pin}
        defaultZoom={11}
        // "cooperative" needs Ctrl/Cmd + scroll to zoom, so the page can still
        // scroll past the map (matches the old scrollWheelZoom={false}).
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        style={{ height: 150, width: "100%" }}
      >
        <FitToBounds bounds={bounds} />
        <AdvancedMarker
          position={pin}
          draggable
          onDragEnd={(e) => {
            if (e.latLng) onPinMove(e.latLng.lat(), e.latLng.lng());
          }}
        />
        {tip && bearingDeg != null && (
          <>
            <DirectionLine fromLat={pinLat} fromLng={pinLng} toLat={tip.lat} toLng={tip.lng} />
            <AdvancedMarker position={tip}>
              <Arrowhead bearingDeg={bearingDeg} />
            </AdvancedMarker>
          </>
        )}
      </Map>
    </APIProvider>
  );
}
