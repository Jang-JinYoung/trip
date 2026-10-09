"use client";
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { hasCoordinates, type Place } from "@/lib/places";
function Controls({
  places,
  selected,
  picking,
  onPick,
}: {
  places: Place[];
  selected: string | null;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const located = places.filter(hasCoordinates);
    const p = located.find((p) => p.id === selected);
    if (p) map.flyTo([p.lat!, p.lng!], 16, { duration: 0.6 });
    else if (located.length)
      map.fitBounds(L.latLngBounds(located.map((p) => [p.lat!, p.lng!])), {
        padding: [45, 45],
        maxZoom: 15,
      });
  }, [places, selected, map]);
  useMapEvents({
    click: (e) => {
      if (picking) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
export default function PlaceMap({
  places,
  selected,
  onSelect,
  picking,
  onPick,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (id: string) => void;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const [tileError, setTileError] = useState(false);
  return (
    <div className={"map-canvas " + (picking ? "picking" : "")}>
      <MapContainer
        center={[22.309, 114.169]}
        zoom={12}
        zoomControl={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          eventHandlers={{
            tileerror: () => setTileError(true),
            tileload: () => setTileError(false),
          }}
        />
        <Controls
          places={places}
          selected={selected}
          picking={picking}
          onPick={onPick}
        />
        {places.filter(hasCoordinates).map((p) => (
          <Marker
            key={p.id}
            position={[p.lat!, p.lng!]}
            icon={L.divIcon({
              className: "",
              html: `<div class="place-pin ${p.id === selected ? "active" : ""}"><span></span></div>`,
              iconSize: [32, 40],
              iconAnchor: [16, 36],
            })}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {p.address || p.region}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {tileError && (
        <div className="map-error" role="status">
          지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.
        </div>
      )}
      {picking && (
        <div className="pick-banner">저장할 위치를 지도에서 클릭하세요</div>
      )}
    </div>
  );
}
