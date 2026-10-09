"use client";
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { hasCoordinates, locationLabel, type Place } from "@/lib/places";
function Controls({
  places,
  focus,
  picking,
  onPick,
}: {
  places: Place[];
  focus: { id: string; zoom: boolean } | null;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const cameraPositions = useRef<string | null>(null);
  const positions = JSON.stringify(
    places
      .filter(hasCoordinates)
      .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng! })),
  );
  useEffect(() => {
    const located = JSON.parse(positions) as {
      id: string;
      lat: number;
      lng: number;
    }[];
    const host = map.getContainer();
    // Defer camera changes while the mobile list tab hides the map.
    let pendingCamera = true;
    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      map.invalidateSize({ pan: false });
      if (!pendingCamera) return;
      pendingCamera = false;
      const p = located.find((p) => p.id === focus?.id);
      const changed = cameraPositions.current !== positions;
      cameraPositions.current = positions;
      if (p)
        map.setView(
          [p.lat, p.lng],
          focus?.zoom === false ? map.getZoom() : Math.max(map.getZoom(), 16),
          { animate: false },
        );
      else if (changed && located.length)
        map.fitBounds(L.latLngBounds(located.map((p) => [p.lat, p.lng])), {
          padding: [45, 45],
          maxZoom: 15,
        });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [positions, focus, map]);
  useMapEvents({
    click: (e) => {
      if (picking) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
export default function PlaceMap({
  places,
  selected,
  focus,
  onSelect,
  picking,
  onPick,
}: {
  places: Place[];
  selected: string | null;
  focus: { id: string; zoom: boolean } | null;
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
          focus={focus}
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
              <br />
              <small>{locationLabel(p)}</small>
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
