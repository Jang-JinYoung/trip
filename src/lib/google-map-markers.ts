export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
};

// Keep the clicked DOM element alive while React opens the place drawer.
export function createGoogleMapMarkers(
  map: google.maps.Map,
  onSelect: (id: string) => void,
) {
  const entries = new Map<
    string,
    {
      marker: google.maps.marker.AdvancedMarkerElement;
      pin: google.maps.marker.PinElement;
      point: MapPoint;
      active?: boolean;
      click: (event: Event) => void;
    }
  >();
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.marker.removeEventListener("gmp-click", entry.click);
    entry.marker.map = null;
    entries.delete(id);
  };
  return {
    update(points: MapPoint[], selected: string | null) {
      const ids = new Set(points.map((p) => p.id));
      for (const id of entries.keys()) if (!ids.has(id)) remove(id);
      for (const point of points) {
        let entry = entries.get(point.id);
        if (!entry) {
          const pin = new google.maps.marker.PinElement({
            borderColor: "#ffffff",
            glyphColor: "#ffffff",
          });
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: point.lat, lng: point.lng },
            title: point.title,
            gmpClickable: true,
          });
          marker.append(pin);
          const click = (event: Event) => {
            event.stopPropagation();
            onSelect(point.id);
          };
          marker.addEventListener("gmp-click", click);
          entry = { marker, pin, point, click };
          entries.set(point.id, entry);
        }
        if (entry.point.lat !== point.lat || entry.point.lng !== point.lng)
          entry.marker.position = { lat: point.lat, lng: point.lng };
        if (entry.point.title !== point.title) entry.marker.title = point.title;
        const active = point.id === selected;
        if (entry.active !== active) {
          entry.pin.background = active ? "#e7a64b" : "#4565ef";
          entry.pin.scale = active ? 1.2 : 1;
          entry.marker.zIndex = active ? 1000 : 0;
          entry.active = active;
        }
        entry.point = point;
      }
    },
    dispose() {
      for (const id of entries.keys()) remove(id);
    },
  };
}
