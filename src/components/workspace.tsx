"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Upload,
  Search,
  Plus,
  Compass,
  Bookmark,
  BookOpen,
  Check,
  X,
  ExternalLink,
  Download,
  Cloud,
  SlidersHorizontal,
  List,
  Map as MapIcon,
  LocateFixed,
  Trash2,
  Coffee,
  Utensils,
  ShoppingBag,
  Camera,
  LoaderCircle,
  LogOut,
  AlertCircle,
  Camera as Instagram,
} from "lucide-react";
import InstagramImport from "./instagram-import";
import MyMapsExport from "./my-maps-export";
import { googleMapsUrl } from "@/lib/google-maps";
import type { User } from "@supabase/supabase-js";
import {
  blankPlace,
  csvExport,
  hasCoordinates,
  locationLabel,
  mergePlaces,
  parseRows,
  priorities,
  safeUrl,
  statuses,
  type Place,
} from "@/lib/places";
import { supabase } from "@/lib/supabase";
const PlaceMap = dynamic(() => import("./place-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" />
      지도를 불러오는 중
    </div>
  ),
});
type GeoResult = { lat: string; lon: string; display_name: string };
function CategoryIcon({ category }: { category: string }) {
  const Icon = /카페|디저트/.test(category)
    ? Coffee
    : /식당|음식/.test(category)
      ? Utensils
      : /쇼핑/.test(category)
        ? ShoppingBag
        : Camera;
  return <Icon size={19} />;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Workspace({
  initialPlaces,
  user,
  onLogout,
}: {
  initialPlaces: Place[];
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [places, setPlaces] = useState<Place[]>(initialPlaces),
    [savedPlaces, setSavedPlaces] = useState<Place[]>(initialPlaces),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("전체"),
    [contentKind, setContentKind] = useState("all"),
    [region, setRegion] = useState("전체 지역"),
    [view, setView] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Place | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [picking, setPicking] = useState(false),
    [mobileMap, setMobileMap] = useState(false),
    [authOpen, setAuthOpen] = useState(false),
    [instagramOpen, setInstagramOpen] = useState(false),
    [results, setResults] = useState<GeoResult[]>([]),
    [geoQuery, setGeoQuery] = useState(""),
    [geoBusy, setGeoBusy] = useState(false);
  const dirty = places !== savedPlaces;
  const fileRef = useRef<HTMLInputElement>(null),
    lastSearch = useRef(0),
    geoCache = useRef(new Map<string, GeoResult[]>());
  const dialogOpen = Boolean(draft) || authOpen || instagramOpen;
  useEffect(() => {
    if (!dialogOpen || picking) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const items = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input, select, textarea",
        ),
      ).filter((el) => el.getClientRects().length > 0);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (instagramOpen) {
          setInstagramOpen(false);
          return;
        }
        setAuthOpen(false);
        setDraft(null);
        setPicking(false);
      }
      if (event.key !== "Tab") return;
      const controls = items(),
        first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [dialogOpen, picking, authOpen, instagramOpen]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const filtered = places.filter(
    (p) =>
      (category === "전체" || p.category === category) &&
      (region === "전체 지역" || p.region === region) &&
      (contentKind === "all" || (p.kind ?? "place") === contentKind) &&
      (view === "all" ||
        (p.kind !== "information" &&
          ((view === "saved" && p.status === "꼭 가기") ||
            (view === "visited" && p.status === "방문 완료") ||
            (view === "unlocated" && !hasCoordinates(p))))) &&
      `${p.name} ${p.region} ${p.address} ${p.description} ${p.note}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const categories = [
    "전체",
    ...Array.from(new Set(places.map((p) => p.category))),
  ];
  const located = places.filter(hasCoordinates).length;
  function openPlace(p: Place) {
    setSelected(p.id);
    setDraft({ ...p });
    setResults([]);
    setGeoQuery(p.address || p.name);
    setPicking(false);
  }
  function update<K extends keyof Place>(key: K, value: Place[K]) {
    setDraft((p) =>
      p
        ? {
            ...p,
            [key]: value,
            ...(["lat", "lng"].includes(key)
              ? { locationInfo: undefined }
              : {}),
          }
        : p,
    );
  }
  function save() {
    if (!draft?.name.trim()) {
      setToast("장소명을 입력해 주세요.");
      return;
    }
    if ((draft.lat !== null || draft.lng !== null) && !hasCoordinates(draft)) {
      setToast("위도(-90~90)와 경도(-180~180)를 모두 입력해 주세요.");
      return;
    }
    const cleaned = {
      ...draft,
      name: draft.name.trim(),
      sourceUrl: safeUrl(draft.sourceUrl),
      mapUrl: safeUrl(draft.mapUrl),
    };
    setPlaces((ps) =>
      ps.some((p) => p.id === cleaned.id)
        ? ps.map((p) => (p.id === cleaned.id ? cleaned : p))
        : [...ps, cleaned],
    );
    setDraft(null);
    setPicking(false);
    setToast("장소를 저장했습니다.");
  }
  async function importFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setToast("10MB 이하의 엑셀 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { readSheet, SheetNotFoundError } =
        await import("read-excel-file/browser");
      const rows = await readSheet(file, "장소목록").catch((e) => {
        if (e instanceof SheetNotFoundError) return readSheet(file, 1);
        throw e;
      });
      const parsed = parseRows(rows);
      if (parsed.places.length > 5000)
        throw Error("한 번에 5,000개 이하의 장소를 가져와 주세요.");
      const merged = mergePlaces(places, parsed.places);
      setPlaces(merged.places);
      setToast(
        `${parsed.places.length - merged.duplicates}개 장소를 가져왔습니다. 중복 ${merged.duplicates}개${merged.located ? `, 기존 장소 ${merged.located}개 위치 추가` : ""}${parsed.skipped ? `, 빈 장소명 ${parsed.skipped}개 제외` : ""}`,
      );
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "엑셀을 읽지 못했습니다. .xlsx 파일을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function geocode() {
    const q = geoQuery.trim();
    if (!q) return;
    const cached = geoCache.current.get(q);
    if (cached) {
      setResults(cached);
      return;
    }
    if (Date.now() - lastSearch.current < 1200) {
      setToast("잠시 후 다시 검색해 주세요.");
      return;
    }
    lastSearch.current = Date.now();
    setGeoBusy(true);
    setResults([]);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok)
        throw Error(
          "주소 검색을 사용할 수 없습니다. 잠시 후 다시 시도하거나 지도에서 직접 지정해 주세요.",
        );
      const data: GeoResult[] = await r.json();
      setResults(data);
      geoCache.current.set(q, data);
      if (!data.length)
        setToast(
          "검색 결과가 없습니다. 영문 주소로 검색하거나 지도에서 직접 지정해 주세요.",
        );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "검색에 실패했습니다.");
    } finally {
      setGeoBusy(false);
    }
  }
  async function cloud(action: "save" | "load") {
    if (!supabase || !user) {
      setAuthOpen(true);
      return;
    }
    if (
      action === "load" &&
      !window.confirm(
        "이 브라우저의 목록을 클라우드에 저장된 목록으로 바꿀까요? 현재 목록은 CSV로 먼저 백업할 수 있습니다.",
      )
    )
      return;
    setBusy(true);
    try {
      if (action === "save") {
        const { error } = await supabase.from("travel_workspaces").upsert({
          user_id: user.id,
          places,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        setSavedPlaces(places);
        setToast("클라우드에 저장했습니다.");
      } else {
        const { data, error } = await supabase
          .from("travel_workspaces")
          .select("places")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setToast("클라우드에 저장된 목록이 없습니다.");
          return;
        }
        if (!Array.isArray(data.places))
          throw Error("클라우드 데이터 형식을 확인해 주세요.");
        setPlaces(data.places);
        setSavedPlaces(data.places);
        setDraft(null);
        setToast("클라우드에서 불러왔습니다.");
      }
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "클라우드 연결에 실패했습니다. DB 설정을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-mark" href="/" aria-label="Trip Atlas 홈">
          <Compass size={27} />
        </a>
        <button
          className={view === "all" ? "rail-button active" : "rail-button"}
          onClick={() => setView("all")}
          aria-label="전체 장소"
        >
          <MapIcon />
        </button>
        <button
          className={view === "saved" ? "rail-button active" : "rail-button"}
          onClick={() => setView("saved")}
          aria-label="꼭 갈 장소"
        >
          <Bookmark />
        </button>
        <button
          className={view === "visited" ? "rail-button active" : "rail-button"}
          onClick={() => setView("visited")}
          aria-label="방문 완료"
        >
          <Check />
        </button>
        <div className="rail-bottom">
          <button
            className="rail-button"
            onClick={() => setAuthOpen(true)}
            aria-label="계정 및 저장 설정"
          >
            <Cloud />
          </button>
          <span className="avatar">나</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="wordmark">
            trip<span>atlas</span>
            <span className="wordmark-divider" />
            <span className="workspace-label">나의 여행 공간</span>
          </div>
          <div className="header-actions">
            <span className="save-indicator">
              {dirty ? "저장하지 않은 변경 있음" : "클라우드 저장됨"}
            </span>
            <button className="button subtle" onClick={() => setAuthOpen(true)}>
              <Cloud size={16} />
              {user ? "내 계정" : "클라우드 연결"}
            </button>
          </div>
        </header>
        <section className="workspace-heading">
          <div>
            <div className="eyebrow">MY PLACES, MY JOURNEY</div>
            <h1>
              여행의 시작은, <span>가고 싶은 곳.</span>
            </h1>
            <p>흩어져 있던 장소를 모아 나만의 여행 지도를 만들어 보세요.</p>
          </div>
          <div className="heading-actions">
            <MyMapsExport places={places} />
            <button
              className="button instagram-button"
              onClick={() => setInstagramOpen(true)}
            >
              <Instagram size={17} />
              Instagram 추가
            </button>
            <button
              className="button"
              disabled={!places.length}
              onClick={() =>
                download(
                  "여행-장소.csv",
                  csvExport(places),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={17} />
              내보내기
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Upload size={17} />
              )}
              엑셀 가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
              }}
            />
          </div>
        </section>
        <section className="stats">
          <button
            className={view === "all" ? "stat selected" : "stat"}
            onClick={() => setView("all")}
          >
            <span className="stat-icon blue">
              <MapPin size={20} />
            </span>
            <span>
              장소와 여행 정보
              <strong>
                {places.length}
                <small>개</small>
              </strong>
            </span>
          </button>
          <button
            className={view === "saved" ? "stat selected" : "stat"}
            onClick={() => setView("saved")}
          >
            <span className="stat-icon orange">
              <Bookmark size={20} />
            </span>
            <span>
              꼭 가고 싶은 곳
              <strong>
                {
                  places.filter(
                    (p) => p.kind !== "information" && p.status === "꼭 가기",
                  ).length
                }
                <small>곳</small>
              </strong>
            </span>
          </button>
          <button
            className={view === "visited" ? "stat selected" : "stat"}
            onClick={() => setView("visited")}
          >
            <span className="stat-icon green">
              <Check size={20} />
            </span>
            <span>
              다녀온 곳
              <strong>
                {
                  places.filter(
                    (p) => p.kind !== "information" && p.status === "방문 완료",
                  ).length
                }
                <small>곳</small>
              </strong>
            </span>
          </button>
          <button
            className={view === "unlocated" ? "stat selected" : "stat"}
            onClick={() => setView("unlocated")}
          >
            <span className="stat-icon purple">
              <LocateFixed size={20} />
            </span>
            <span>
              위치 지정 대기
              <strong>
                {
                  places.filter(
                    (p) => p.kind !== "information" && !hasCoordinates(p),
                  ).length
                }
                <small>곳</small>
              </strong>
            </span>
          </button>
        </section>
        <section className="board">
          <div className="board-toolbar">
            <div className="search-box">
              <Search size={19} />
              <input
                aria-label="장소 검색"
                placeholder="장소, 지역, 메모 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="검색 지우기">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="toolbar-right">
              <SlidersHorizontal size={17} />
              <select
                aria-label="장소·정보 필터"
                value={contentKind}
                onChange={(e) => {
                  setContentKind(e.target.value);
                  setView("all");
                }}
              >
                <option value="all">장소 + 여행 정보</option>
                <option value="place">장소만</option>
                <option value="information">여행 정보만</option>
              </select>
              <select
                aria-label="지역 필터"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                {[
                  "전체 지역",
                  ...Array.from(
                    new Set(places.map((p) => p.region).filter(Boolean)),
                  ),
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                className="button small"
                onClick={() => openPlace(blankPlace())}
              >
                <Plus size={16} />
                장소 추가
              </button>
              <button
                className="button small mobile-toggle"
                onClick={() => setMobileMap(!mobileMap)}
              >
                {mobileMap ? <List size={16} /> : <MapIcon size={16} />}
              </button>
            </div>
          </div>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                className={
                  c === category ? "category-tab active" : "category-tab"
                }
                onClick={() => setCategory(c)}
              >
                {c}
                {c === "전체" && <span>{places.length}</span>}
              </button>
            ))}
          </div>
          <div className={"board-content " + (mobileMap ? "show-map" : "")}>
            <div className="place-list">
              <div className="list-heading">
                <span>
                  {view === "saved"
                    ? "꼭 갈 장소"
                    : view === "visited"
                      ? "다녀온 장소"
                      : view === "unlocated"
                        ? "위치를 지정할 장소"
                        : contentKind === "information"
                          ? "여행 정보"
                          : "전체 목록"}{" "}
                  <b>{filtered.length}</b>
                </span>
                <span>등록 순</span>
              </div>
              {!filtered.length ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <MapPin size={30} />
                  </div>
                  <h2>
                    {places.length
                      ? "조건에 맞는 장소가 없어요"
                      : "첫 번째 장소를 담아 보세요"}
                  </h2>
                  <p>
                    {places.length
                      ? "검색어나 필터를 바꿔 보세요."
                      : "엑셀 속 맛집, 카페, 가고 싶은 곳을 한 번에 가져올 수 있어요."}
                  </p>
                  {!places.length && (
                    <button
                      className="button primary"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={16} />
                      엑셀 파일 선택
                    </button>
                  )}
                  <small>
                    {!places.length && "장소목록 시트 · .xlsx 지원"}
                  </small>
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    className={
                      "place-card " + (selected === p.id ? "selected" : "")
                    }
                    key={p.id}
                    onClick={() => openPlace(p)}
                  >
                    <span
                      className={
                        "category-icon " +
                        (/카페/.test(p.category)
                          ? "cafe"
                          : /식당/.test(p.category)
                            ? "food"
                            : "sight")
                      }
                    >
                      {p.kind === "information" ? (
                        <BookOpen size={19} />
                      ) : (
                        <CategoryIcon category={p.category} />
                      )}
                    </span>
                    <span className="place-card-body">
                      <span className="place-meta">
                        {p.category}
                        <i />
                        {p.region || "지역 미지정"}
                      </span>
                      <strong>{p.name}</strong>
                      <span className="place-description">
                        {p.description ||
                          p.address ||
                          "장소의 정보를 추가해 보세요."}
                      </span>
                      <span className="place-tags">
                        <span
                          className={
                            "tag " +
                            (p.status === "꼭 가기"
                              ? "tag-orange"
                              : p.status === "방문 완료"
                                ? "tag-green"
                                : "")
                          }
                        >
                          {p.kind === "information"
                            ? !p.description
                              ? "확인 대기"
                              : "여행 정보"
                            : p.status}
                        </span>
                        {p.day && <span className="tag">{p.day}</span>}
                        {p.kind !== "information" && !hasCoordinates(p) && (
                          <span className="unlocated">위치 미지정</span>
                        )}
                        {hasCoordinates(p) && p.locationInfo && (
                          <span className="tag">{locationLabel(p)}</span>
                        )}
                      </span>
                    </span>
                    <span className="card-chevron">›</span>
                  </button>
                ))
              )}
            </div>
            <div className="map-panel">
              <div className="map-label">
                <span className="map-live-dot" />
                나의 여행 지도
                <span>{filtered.filter(hasCoordinates).length}개 표시</span>
              </div>
              <PlaceMap
                places={filtered}
                selected={selected}
                onSelect={(id) => {
                  const p = places.find((p) => p.id === id);
                  if (p) openPlace(p);
                }}
                picking={picking}
                onPick={(lat, lng) => {
                  setDraft((p) =>
                    p ? { ...p, lat, lng, locationInfo: undefined } : p,
                  );
                  setPicking(false);
                  setToast(
                    "위치를 선택했습니다. 장소 저장을 눌러 확정해 주세요.",
                  );
                }}
              />
              {!located && !picking && (
                <div className="map-hint">
                  <LocateFixed size={19} />
                  <div>
                    <strong>가고 싶은 곳에 핀을 꽂아 보세요</strong>
                    <p>
                      장소를 선택해 주소를 검색하거나 위치를 직접 지정하세요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <footer className="workspace-footer">
          <span>
            <Compass size={14} />
            작은 발견이 모여, 나만의 여행이 됩니다.
          </span>
          <span>OpenStreetMap · {located}곳 위치 저장됨</span>
        </footer>
      </main>
      {draft && (
        <div
          className={"drawer-backdrop " + (picking ? "picking-backdrop" : "")}
          onClick={() => {
            if (!picking) {
              setDraft(null);
              setSelected(null);
            }
          }}
        >
          <section
            className="drawer"
            role="dialog"
            aria-modal={!picking}
            aria-label={
              draft.kind === "information" ? "여행 정보 편집" : "장소 편집"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">PLACE DETAILS</span>
                <h2>
                  {draft.kind === "information"
                    ? "여행 정보 정리하기"
                    : places.some((p) => p.id === draft.id)
                      ? "장소 정리하기"
                      : "새로운 장소"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => {
                  setDraft(null);
                  setPicking(false);
                }}
              >
                <X />
              </button>
            </div>
            <div className="drawer-content">
              <label>
                {draft.kind === "information" ? "정보 제목" : "장소명"}
                <input
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="장소 이름"
                />
              </label>
              <div className="form-row">
                <label>
                  분류
                  <input
                    value={draft.category}
                    onChange={(e) => update("category", e.target.value)}
                  />
                </label>
                <label>
                  지역
                  <input
                    value={draft.region}
                    onChange={(e) => update("region", e.target.value)}
                  />
                </label>
              </div>
              {draft.kind !== "information" && (
                <label>
                  주소
                  <input
                    value={draft.address}
                    onChange={(e) => update("address", e.target.value)}
                  />
                </label>
              )}
              <label>
                {draft.kind === "information" ? "정보 내용" : "장소 소개"}
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
              {draft.kind !== "information" && (
                <>
                  <div className="form-row">
                    <label>
                      방문상태
                      <select
                        value={draft.status}
                        onChange={(e) => update("status", e.target.value)}
                      >
                        {Array.from(new Set([...statuses, draft.status])).map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      우선순위
                      <select
                        value={draft.priority}
                        onChange={(e) => update("priority", e.target.value)}
                      >
                        {Array.from(
                          new Set([...priorities, draft.priority]),
                        ).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    희망일
                    <input
                      value={draft.day}
                      placeholder="예: 11월 14일 / 둘째 날"
                      onChange={(e) => update("day", e.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                나의 메모
                <textarea
                  rows={3}
                  placeholder="먹고 싶은 메뉴, 예약 정보, 함께 갈 사람…"
                  value={draft.note}
                  onChange={(e) => update("note", e.target.value)}
                />
              </label>
              {(draft.price || draft.hours || draft.caution) && (
                <div className="source-info">
                  <h3>엑셀에 담긴 정보</h3>
                  {draft.price && (
                    <p>
                      <b>가격</b>
                      {draft.price}
                    </p>
                  )}
                  {draft.hours && (
                    <p>
                      <b>시간</b>
                      {draft.hours}
                    </p>
                  )}
                  {draft.caution && (
                    <p className="caution">
                      <AlertCircle size={16} />
                      {draft.caution}
                    </p>
                  )}
                  <small>원문 기준 정보입니다. 방문 전에 확인해 주세요.</small>
                </div>
              )}
              {draft.kind !== "information" && (
                <div className="location-section">
                  <h3>
                    <MapPin size={18} />
                    지도에 위치 지정
                  </h3>
                  {hasCoordinates(draft) && draft.locationInfo && (
                    <div className="source-info">
                      <strong>{locationLabel(draft)}</strong>
                      <p>{draft.locationInfo.label}</p>
                      {draft.locationInfo.precision === "address" && (
                        <small>
                          엑셀 주소에 해당하는 건물 위치입니다. 매장 입구와 현재
                          영업 여부는 별도 확인해 주세요.
                        </small>
                      )}
                      {draft.locationInfo.precision === "area" && (
                        <small>
                          넓은 지역이나 경로의 대표 지점입니다. 출발점·입구와
                          다를 수 있습니다.
                        </small>
                      )}
                      {safeUrl(draft.locationInfo.sourceUrl) && (
                        <a
                          href={safeUrl(draft.locationInfo.sourceUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          좌표 출처 확인
                        </a>
                      )}
                    </div>
                  )}
                  <div className="geo-search">
                    <input
                      aria-label="주소 검색어"
                      value={geoQuery}
                      onChange={(e) => setGeoQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void geocode();
                      }}
                      placeholder="영문 장소명 또는 주소"
                    />
                    <button
                      className="button"
                      disabled={geoBusy}
                      onClick={() => void geocode()}
                    >
                      {geoBusy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                    </button>
                  </div>
                  <div className="geo-results">
                    {results.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          update("lat", Number(r.lat));
                          update("lng", Number(r.lon));
                          setResults([]);
                          setToast(
                            "검색 위치를 선택했습니다. 저장하면 지도에 표시됩니다.",
                          );
                        }}
                      >
                        <MapPin size={16} />
                        {r.display_name}
                      </button>
                    ))}
                  </div>
                  <small className="geo-credit">
                    주소 검색: © OpenStreetMap 기여자 · 후보 주소를 확인하고
                    선택하세요.
                  </small>
                  <div className="form-row">
                    <label>
                      위도
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={draft.lat ?? ""}
                        onChange={(e) =>
                          update(
                            "lat",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      경도
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={draft.lng ?? ""}
                        onChange={(e) =>
                          update(
                            "lng",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="button full"
                    onClick={() => {
                      setPicking(!picking);
                      setMobileMap(true);
                    }}
                  >
                    <LocateFixed size={16} />
                    {picking ? "위치 선택 취소" : "지도에서 직접 지정"}
                  </button>
                  {hasCoordinates(draft) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        update("lat", null);
                        update("lng", null);
                      }}
                    >
                      저장된 좌표 지우기
                    </button>
                  )}
                </div>
              )}
              <div className="source-links">
                {draft.kind !== "information" && (
                  <a
                    className="button"
                    href={googleMapsUrl(draft)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google 지도에서 열기
                    <ExternalLink size={14} />
                  </a>
                )}
                {safeUrl(draft.sourceUrl) && (
                  <a
                    className="button"
                    href={safeUrl(draft.sourceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    원본 게시물
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <div className="instagram-sources">
                {places.some((p) => p.id === draft.id) && (
                  <button
                    className="button full"
                    onClick={() => setInstagramOpen(true)}
                  >
                    <Instagram size={16} />
                    Instagram 정보 추가
                  </button>
                )}
                {(draft.instagramSources ?? []).map((source) => (
                  <details key={source.url}>
                    <summary>Instagram 게시물 정보</summary>
                    <a
                      href={safeUrl(source.url) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      원본 게시물 열기 <ExternalLink size={13} />
                    </a>
                    <p>
                      {source.caption ||
                        "설명 없이 링크만 저장된 게시물입니다."}
                    </p>
                  </details>
                ))}
              </div>
            </div>
            <div className="drawer-footer">
              <button
                className="icon-button danger"
                aria-label="장소 삭제"
                onClick={() => {
                  if (window.confirm("이 장소를 삭제할까요?")) {
                    setPlaces((ps) => ps.filter((p) => p.id !== draft.id));
                    setDraft(null);
                    setPicking(false);
                  }
                }}
              >
                <Trash2 size={18} />
              </button>
              <button className="button primary" onClick={save}>
                <Check size={17} />
                장소 저장
              </button>
            </div>
          </section>
        </div>
      )}
      {instagramOpen && (
        <InstagramImport
          places={
            draft && places.some((p) => p.id === draft.id)
              ? places.map((p) => (p.id === draft.id ? draft : p))
              : places
          }
          initialTarget={
            draft && places.some((p) => p.id === draft.id) ? draft.id : null
          }
          onClose={() => setInstagramOpen(false)}
          onApply={(items) => {
            setPlaces((current) => {
              const updates = new Map(items.map((p) => [p.id, p]));
              return [
                ...current.map((p) => updates.get(p.id) ?? p),
                ...items.filter(
                  (p) => !current.some((existing) => existing.id === p.id),
                ),
              ];
            });
            setInstagramOpen(false);
            if (draft) setDraft(items.find((p) => p.id === draft.id) ?? draft);
            setView("all");
            setCategory("전체");
            setRegion("전체 지역");
            setContentKind("all");
            setQuery("");
            setToast(`Instagram에서 ${items.length}개 항목을 저장했습니다.`);
          }}
        />
      )}
      {authOpen && (
        <div className="modal-backdrop" onClick={() => setAuthOpen(false)}>
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-label="클라우드 연결"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="닫기"
              onClick={() => setAuthOpen(false)}
            >
              <X />
            </button>
            <span className="stat-icon blue">
              <Cloud size={24} />
            </span>
            <h2>여행 지도를 안전하게 보관하세요</h2>
            <p>{user.email}</p>
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => void cloud("save")}
            >
              현재 목록 클라우드에 저장
            </button>
            <button
              className="button full"
              disabled={busy}
              onClick={() => void cloud("load")}
            >
              클라우드 목록 다시 불러오기
            </button>
            <small>
              로그인하면 내 계정의 목록을 자동으로 불러옵니다. 변경한 내용은
              클라우드에 저장해 주세요.
            </small>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (
                  dirty &&
                  !window.confirm(
                    "저장하지 않은 변경 내용이 있습니다. 저장하지 않고 로그아웃할까요?",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await onLogout();
                } catch {
                  setToast("로그아웃하지 못했습니다. 다시 시도해 주세요.");
                  setBusy(false);
                }
              }}
            >
              <LogOut size={15} />
              로그아웃
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
