"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { hasCoordinates, locationLabel, type Place } from "@/lib/places";

const OpenStreetMap = dynamic(() => import("./openstreet-map"), { ssr: false });
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
let configured = false;

type Props = {
  places: Place[];
  selected: string | null;
  onSelect: (id: string) => void;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
};

function GoogleMap({ places, selected, onSelect, picking, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState(false);
  const [fallback, setFallback] = useState(false);
  const handlers = useRef({ onSelect, onPick, picking });
  useEffect(() => {
    handlers.current = { onSelect, onPick, picking };
  }, [onSelect, onPick, picking]);

  useEffect(() => {
    let cancelled = false;
    let instance: google.maps.Map | undefined;
    const host = container.current;
    const globals = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = globals.gm_authFailure;
    const authFailure = () => {
      if (!cancelled) setError(true);
    };
    globals.gm_authFailure = authFailure;
    const timeout = window.setTimeout(authFailure, 20000);
    async function initialize() {
      try {
        if (!configured) {
          setOptions({ key: apiKey, v: "quarterly", language: "ko" });
          configured = true;
        }
        const [{ Map }] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
        ]);
        if (cancelled || !host) return;
        instance = new Map(host, {
          center: { lat: 22.309, lng: 114.169 },
          zoom: 12,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        instance.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (handlers.current.picking && event.latLng)
            handlers.current.onPick(event.latLng.lat(), event.latLng.lng());
        });
        setMap(instance);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (globals.gm_authFailure === authFailure)
        globals.gm_authFailure = previousAuthFailure;
      if (instance) google.maps.event.clearInstanceListeners(instance);
    };
  }, []);

  const markerData = JSON.stringify(
    places.filter(hasCoordinates).map((p) => ({
      id: p.id,
      lat: p.lat!,
      lng: p.lng!,
      title: `${p.name} · ${locationLabel(p)}`,
    })),
  );
  useEffect(() => {
    if (!map || fallback) return;
    const points = JSON.parse(markerData) as {
      id: string;
      lat: number;
      lng: number;
      title: string;
    }[];
    const markers = points.map((place) => {
      const active = place.id === selected;
      const pin = new google.maps.marker.PinElement({
        background: active ? "#e7a64b" : "#4565ef",
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
        scale: active ? 1.2 : 1,
      });
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: place.lat!, lng: place.lng! },
        title: place.title,
        zIndex: active ? 1000 : undefined,
      });
      marker.append(pin);
      marker.addListener("click", () => handlers.current.onSelect(place.id));
      return marker;
    });
    return () => {
      markers.forEach((marker) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.map = null;
      });
    };
  }, [map, markerData, selected, fallback]);

  // Only move the camera when the visible coordinates or selection change.
  const positions = JSON.stringify(
    places.filter(hasCoordinates).map((p) => ({
      id: p.id,
      lat: p.lat!,
      lng: p.lng!,
    })),
  );
  useEffect(() => {
    if (!map || fallback) return;
    const points = JSON.parse(positions) as {
      id: string;
      lat: number;
      lng: number;
    }[];
    let idle: google.maps.MapsEventListener | undefined;
    const moveCamera = () => {
      idle?.remove();
      const active = points.find((p) => p.id === selected);
      if (active || points.length === 1) {
        map.panTo(active || points[0]);
        map.setZoom(16);
      } else if (points.length) {
        const bounds = new google.maps.LatLngBounds();
        points.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 60);
        idle = google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
        });
      }
    };
    const host = map.getDiv();
    let visible = host.clientWidth > 0 && host.clientHeight > 0;
    if (visible) moveCamera();
    // Mobile list/map tabs hide the map; fitBounds ignores zero-sized maps.
    const observer = new ResizeObserver(() => {
      const nextVisible = host.clientWidth > 0 && host.clientHeight > 0;
      if (nextVisible && !visible) moveCamera();
      visible = nextVisible;
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      idle?.remove();
    };
  }, [map, positions, selected, fallback]);

  useEffect(() => {
    map?.setOptions({ draggableCursor: picking ? "crosshair" : null });
  }, [map, picking]);

  if (fallback)
    return (
      <OpenStreetMap {...{ places, selected, onSelect, picking, onPick }} />
    );
  return (
    <div className={"map-canvas " + (picking ? "picking" : "")}>
      <div
        ref={container}
        className="google-map-container"
        aria-label="Google 여행 지도"
      />
      {!map && !error && (
        <div className="google-map-loading" role="status">
          Google 지도를 불러오는 중…
        </div>
      )}
      {error && (
        <div className="map-error" role="alert">
          <p>
            Google 지도를 불러오지 못했습니다. 연결 상태와 지도 설정을 확인해
            주세요.
          </p>
          <button className="button" onClick={() => setFallback(true)}>
            OpenStreetMap으로 보기
          </button>
        </div>
      )}
      {picking && (
        <div className="pick-banner">저장할 위치를 지도에서 클릭하세요</div>
      )}
    </div>
  );
}

export default function PlaceMap(props: Props) {
  if (apiKey) return <GoogleMap {...props} />;
  return (
    <div className="map-canvas">
      <OpenStreetMap {...props} />
      <div className="map-provider-note" role="status">
        Google 지도 연결 전 · OpenStreetMap으로 표시 중
      </div>
    </div>
  );
}
