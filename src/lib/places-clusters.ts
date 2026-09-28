type Mappable = { id: string; coordinates: { lat: number; lng: number } };
export type PlaceCluster<T> = { id: string; places: T[]; coordinates: { lat: number; lng: number } };

/** Small, deterministic screen-distance clusters. No extra map requests or library. */
export function clusterPlaces<T extends Mappable>(places: readonly T[], zoom: number, selectedId: string | null = null): PlaceCluster<T>[] {
  if (zoom >= 17) return places.map(place => ({ id: place.id, places: [place], coordinates: place.coordinates }));
  const scale = 256 * 2 ** zoom;
  const project = (place: T) => {
    const sine = Math.sin(Math.max(-85, Math.min(85, place.coordinates.lat)) * Math.PI / 180);
    return { x: (place.coordinates.lng + 180) / 360 * scale, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale };
  };
  const groups: { places: T[]; x: number; y: number }[] = [];
  for (const place of [...places].sort((a, b) => a.id.localeCompare(b.id))) {
    const point = project(place);
    const group = place.id === selectedId ? undefined : groups.find(group =>
      group.places[0].id !== selectedId && Math.hypot(group.x - point.x, group.y - point.y) <= 52);
    if (group) {
      const count = group.places.length;
      group.x = (group.x * count + point.x) / (count + 1);
      group.y = (group.y * count + point.y) / (count + 1);
      group.places.push(place);
    } else groups.push({ places: [place], ...point });
  }
  return groups.map(group => ({
    id: group.places.map(place => place.id).join("|"), places: group.places,
    coordinates: {
      lat: group.places.reduce((sum, place) => sum + place.coordinates.lat, 0) / group.places.length,
      lng: group.places.reduce((sum, place) => sum + place.coordinates.lng, 0) / group.places.length,
    },
  }));
}
