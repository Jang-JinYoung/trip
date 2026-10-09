"use client";
import { useEffect, useRef, useState } from "react";
import { Camera as Instagram, X, ExternalLink, LoaderCircle, Check } from "lucide-react";
import {
  attachInstagram,
  extractInstagramFields,
  normalizeInstagramUrl,
  sameInstagramPost,
  type InstagramFields,
} from "@/lib/instagram";
import type { InstagramPreview } from "@/lib/instagram-fetch";
import type { Place } from "@/lib/places";

export default function InstagramImport({
  places,
  initialTarget,
  onClose,
  onApply,
}: {
  places: Place[];
  initialTarget: string | null;
  onClose: () => void;
  onApply: (place: Place) => void;
}) {
  const [url, setUrl] = useState(""),
    [caption, setCaption] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">(
      initialTarget ? "existing" : "new",
    ),
    [target, setTarget] = useState(initialTarget ?? places[0]?.id ?? "");
  const [fields, setFields] = useState<InstagramFields>(
    extractInstagramFields(""),
  );
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  let canonical = "";
  try {
    canonical = normalizeInstagramUrl(url);
  } catch {}
  const matches = canonical
    ? places.filter(
        (p) =>
          sameInstagramPost(p.sourceUrl, canonical) ||
          p.instagramSources?.some((s) => sameInstagramPost(s.url, canonical)),
      )
    : [];
  function fillFields(text: string) {
    const extracted = extractInstagramFields(text);
    setFields(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([k, v]) => [
            k,
            v || extracted[k as keyof InstagramFields],
          ]),
        ) as InstagramFields,
    );
  }
  async function load() {
    setError("");
    setMessage("");
    let normalized: string;
    try {
      normalized = normalizeInstagramUrl(url);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const response = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
        signal: request.signal,
      });
      const data: InstagramPreview & { error?: string } = await response.json();
      if (!response.ok)
        throw Error(data.error || "게시물 정보를 가져오지 못했습니다.");
      if (data.caption) {
        setCaption(data.caption);
        fillFields(data.caption);
      }
      setMessage(data.message);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error ? e.message : "설명을 직접 붙여 넣어 주세요.",
        );
    } finally {
      if (controller.current === request) setBusy(false);
    }
  }
  function apply() {
    try {
      if (mode === "existing" && !places.some((p) => p.id === target))
        throw Error("정보를 추가할 장소를 선택해 주세요.");
      const place =
        mode === "existing" ? places.find((p) => p.id === target)! : null;
      onApply(attachInstagram(place, url, caption, fields));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const labels: Record<keyof InstagramFields, string> = {
    name: "장소명",
    address: "주소",
    region: "지역",
    category: "분류",
    hours: "영업시간",
    price: "가격",
  };
  return (
    <div className="modal-backdrop instagram-backdrop" onClick={onClose}>
      <section
        className="instagram-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Instagram에서 장소 가져오기"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="instagram-header">
          <div>
            <div className="eyebrow">FROM YOUR SAVED POSTS</div>
            <h2>
              <Instagram size={24} />
              Instagram에서 가져오기
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Instagram 가져오기 닫기"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="instagram-body">
          <label>
            게시물 또는 릴스 URL
            <div className="instagram-url">
              <input
                type="url"
                placeholder="https://www.instagram.com/reel/…/"
                value={url}
                disabled={busy}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setMessage("");
                  setError("");
                  setCaption("");
                  setFields(extractInstagramFields(""));
                }}
              />
              <button
                className="button primary"
                disabled={busy || !url.trim()}
                onClick={() => void load()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Instagram size={16} />
                )}
                정보 가져오기
              </button>
            </div>
          </label>
          <p className="instagram-help">
            공개 게시물에서 제공되는 설명을 가져옵니다. 가져올 수 없으면 원문
            설명을 아래에 붙여 넣어 주세요.
          </p>
          {message && (
            <p className="instagram-notice" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="instagram-error" role="alert">
              {error}
            </p>
          )}
          {canonical && (
            <a
              className="text-button instagram-original"
              href={canonical}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram 원본 열기
              <ExternalLink size={14} />
            </a>
          )}
          {!!matches.length && (
            <div className="instagram-notice">
              이미 연결된 장소가 있어요.
              <div className="instagram-matches">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setMode("existing");
                      setTarget(p.id);
                    }}
                  >
                    {p.name}에 정보 추가
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className="instagram-mode"
            role="group"
            aria-label="정보 추가 방식"
          >
            <button
              className={mode === "new" ? "active" : ""}
              aria-pressed={mode === "new"}
              onClick={() => setMode("new")}
            >
              새 장소 만들기
            </button>
            <button
              className={mode === "existing" ? "active" : ""}
              aria-pressed={mode === "existing"}
              disabled={!places.length}
              onClick={() => setMode("existing")}
            >
              기존 장소에 추가
            </button>
          </div>
          {mode === "existing" && (
            <label>
              정보를 추가할 장소
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="" disabled>
                  장소 선택
                </option>
                {places.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.region || "지역 미지정"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            게시물 설명
            <textarea
              rows={6}
              maxLength={12000}
              value={caption}
              disabled={busy}
              placeholder={
                "게시물 설명을 붙여 넣으세요.\n장소명: …\n주소: …\n영업시간: …"
              }
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          <button
            className="button small"
            onClick={() => fillFields(caption)}
            disabled={!caption.trim() || busy}
          >
            설명에서 항목 채우기
          </button>
          <p className="instagram-help">
            ‘장소명:’, ‘주소:’, ‘영업시간:’처럼 명시된 항목만 채웁니다. 여러
            장소가 소개된 게시물은 장소별로 나누어 추가해 주세요.
          </p>
          {mode === "existing" && (
            <p className="instagram-notice">
              기존 정보는 유지하고 빈 항목을 채웁니다. 게시물 설명과 링크는 이
              장소의 Instagram 출처에 함께 저장됩니다.
            </p>
          )}
          <div className="instagram-fields">
            {(Object.keys(labels) as (keyof InstagramFields)[]).map((key) => (
              <label key={key}>
                {labels[key]}
                {key === "name" && mode === "new" ? " *" : ""}
                <input
                  value={fields[key]}
                  maxLength={500}
                  placeholder={
                    mode === "existing"
                      ? places.find((p) => p.id === target)?.[key] ||
                        "추가할 정보"
                      : "직접 입력하거나 설명에서 채우기"
                  }
                  onChange={(e) =>
                    setFields((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <p className="instagram-help">
            저장 후 장소 편집에서 주소를 검색해 지도 위치를 지정할 수 있습니다.
          </p>
        </div>
        <footer className="instagram-footer">
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !canonical ||
              (mode === "new" && !fields.name.trim()) ||
              (mode === "existing" && !target)
            }
            onClick={apply}
          >
            <Check size={17} />
            {mode === "new" ? "새 장소 저장" : "장소에 정보 저장"}
          </button>
        </footer>
      </section>
    </div>
  );
}
