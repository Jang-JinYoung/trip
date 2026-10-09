"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { hasCoordinates, locationLabel, type Place } from "@/lib/places";
import {
  createGoogleMapMarkers,
  type MapPoint,
} from "@/lib/google-map-markers";
import {
  requestMapPermit,
  parseMapPermit,
  type MapPermit,
} from "@/lib/map-budget";

const OpenStreetMap = dynamic(() => import("./openstreet-map"), { ssr: false });
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
let configured = false;

const mapErrors = {
  auth: "Google이 지도 사용을 승인하지 않았습니다. API 키의 허용 사이트, Maps JavaScript API 활성화, 결제 연결을 확인해 주세요. (MAP_AUTH)",
  timeout:
    "Google 지도 연결 시간이 초과되었습니다. 네트워크 연결이나 브라우저의 차단 설정을 확인한 뒤 새로고침해 주세요. (MAP_TIMEOUT)",
  script:
    "Google 지도 스크립트를 불러오지 못했습니다. 네트워크 연결이나 브라우저의 차단 설정을 확인해 주세요. (MAP_SCRIPT)",
  initialize:
    "Google 지도 화면을 초기화하지 못했습니다. 새로고침 후에도 계속되면 MAP_INIT 오류를 알려 주세요.",
};

type Props = {
  places: Place[];
  selected: string | null;
  focus: { id: string; zoom: boolean } | null;
  onSelect: (id: string) => void;
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
};

function GoogleMap({
  places,
  selected,
  focus,
  onSelect,
  picking,
  onPick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<keyof typeof mapErrors | null>(null);
  const [fallback, setFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState("");
  const permitRequest = useRef<Promise<MapPermit> | null>(null);
  const markers = useRef<ReturnType<typeof createGoogleMapMarkers> | null>(
    null,
  );
  const cameraPositions = useRef<string | null>(null);
  const handlers = useRef({ onSelect, onPick, picking });
  useEffect(() => {
    handlers.current = { onSelect, onPick, picking };
  }, [onSelect, onPick, picking]);

  useEffect(() => {
    if (fallback) return;
    let cancelled = false;
    let failed = false;
    let librariesLoaded = false;
    let timeout: number | undefined;
    let instance: google.maps.Map | undefined;
    const host = container.current;
    const globals = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = globals.gm_authFailure;
    const fail = (reason: keyof typeof mapErrors) => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(timeout);
      setError(reason);
    };
    const authFailure = () => fail("auth");
    globals.gm_authFailure = authFailure;
    async function initialize() {
      try {
        // One reservation per mounted map, including React Strict Mode replay.
        permitRequest.current ??= requestMapPermit();
        const permit = await permitRequest.current;
        if (cancelled) return;
        if (!permit.allowed) {
          setFallbackReason(
            permit.reason === "limit_reached"
              ? "이번 달 Google 지도 사용 한도에 도달해 OpenStreetMap으로 표시합니다."
              : "Google 지도 사용량을 확인할 수 없어 OpenStreetMap으로 표시합니다.",
          );
          setFallback(true);
          return;
        }
        timeout = window.setTimeout(() => fail("timeout"), 20000);
        if (!configured) {
          setOptions({ key: apiKey, v: "quarterly", language: "ko" });
          configured = true;
        }
        const [{ Map }] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
        ]);
        librariesLoaded = true;
        if (cancelled || failed || !host) return;
        if (!parseMapPermit(permit).allowed) {
          setFallbackReason(
            "지도 연결 시간이 초과되어 OpenStreetMap으로 표시합니다.",
          );
          setFallback(true);
          return;
        }
        instance = new Map(host, {
          center: { lat: 22.309, lng: 114.169 },
          zoom: 12,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        instance.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (handlers.current.picking && event.latLng)
            handlers.current.onPick(event.latLng.lat(), event.latLng.lng());
        });
        setMap(instance);
      } catch {
        fail(librariesLoaded ? "initialize" : "script");
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
  }, [fallback]);

  useEffect(() => {
    if (!map || fallback || error) return;
    const controller = createGoogleMapMarkers(map, (id) =>
      handlers.current.onSelect(id),
    );
    markers.current = controller;
    return () => {
      controller.dispose();
      markers.current = null;
    };
  }, [map, fallback, error]);

  const markerData = useMemo(
    () =>
      JSON.stringify(
        places.filter(hasCoordinates).map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          title: `${p.name} · ${locationLabel(p)}`,
        })),
      ),
    [places],
  );
  useEffect(() => {
    markers.current?.update(JSON.parse(markerData) as MapPoint[], selected);
  }, [map, markerData, selected, fallback, error]);

  // Both entry points center the place; marker clicks preserve the current zoom.
  const positions = useMemo(
    () =>
      JSON.stringify(
        places.filter(hasCoordinates).map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
        })),
      ),
    [places],
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
      const active = points.find((p) => p.id === focus?.id);
      const changed = cameraPositions.current !== positions;
      cameraPositions.current = positions;
      if (active || (changed && points.length === 1)) {
        map.setCenter(active || points[0]);
        // Focusing a marker should not zoom out from an existing close-up.
        if (focus?.zoom !== false && (map.getZoom() ?? 0) < 16) map.setZoom(16);
      } else if (changed && points.length) {
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
  }, [map, positions, focus, fallback]);

  useEffect(() => {
    map?.setOptions({ draggableCursor: picking ? "crosshair" : null });
  }, [map, picking]);

  if (fallback)
    return (
      <div className="map-canvas">
        <OpenStreetMap
          {...{ places, selected, focus, onSelect, picking, onPick }}
        />
        {fallbackReason && (
          <div className="map-provider-note" role="status">
            {fallbackReason}
          </div>
        )}
      </div>
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
          <p>{mapErrors[error]}</p>
          {error === "auth" && (
            <p>
              정확한 원인은 F12 → Console의 Google Maps JavaScript API error
              항목에서 확인할 수 있습니다.
            </p>
          )}
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

function PlaceMap(props: Props) {
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

export default memo(PlaceMap);
