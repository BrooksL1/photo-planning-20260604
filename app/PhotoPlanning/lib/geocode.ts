// Forward geocoding for the "enter a camera location" search box. Nominatim
// (OpenStreetMap) is free, keyless, and CORS-open for direct browser use --
// confirmed via a live header check (access-control-allow-origin: *).

export type PlaceSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: { display_name: string; lat: string; lon: string }[] = await res.json();
  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}
