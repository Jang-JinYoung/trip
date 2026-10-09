"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera as Instagram,
  X,
  ExternalLink,
  LoaderCircle,
  Check,
  MapPin,
  BookOpen,
} from "lucide-react";
import {
  attachInstagram,
  extractInstagramFields,
  type InstagramFields,
} from "@/lib/instagram";
import {
  analyzeInstagramCaption,
  createInstagramInformation,
  createInstagramPlaces,
  findInstagramMatches,
  normalizeReelUrl,
  type InstagramAnalysis,
} from "@/lib/instagram-analysis";
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
  onApply: (items: Place[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<InstagramPreview | null>(null);
  const [kind, setKind] = useState<"place" | "information">("information");
  const [candidates, setCandidates] = useState<InstagramFields[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [target, setTarget] = useState(initialTarget ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  function showAnalysis(analysis: InstagramAnalysis) {
    setKind(analysis.kind === "place" ? "place" : "information");
    setTitle(analysis.title);
    setCandidates(analysis.candidates);
    setSelected(analysis.candidates.map((_, index) => index));
  }
  async function load() {
    setError("");
    let normalized: string;
    try {
      normalized = normalizeReelUrl(url);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setPreview(null);
    try {
      const response = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
        signal: request.signal,
      });
      const data: InstagramPreview & { error?: string } = await response.json();
      if (!response.ok) throw Error(data.error || "릴스를 읽지 못했습니다.");
      if (controller.current !== request || request.signal.aborted) return;
      setPreview(data);
      setCaption(data.caption);
      showAnalysis(data.analysis);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        );
    } finally {
      if (controller.current === request) setBusy(false);
    }
  }
  const matches = preview ? findInstagramMatches(places, preview.url) : [];
  const existingTarget = places.find((p) => p.id === target);
  function apply() {
    if (!preview) return;
    try {
      if (target && !existingTarget)
        throw Error("연결할 항목을 다시 선택해 주세요.");
      if (existingTarget) {
        onApply([
          attachInstagram(
            existingTarget,
            preview.url,
            caption,
            extractInstagramFields(""),
          ),
        ]);
        return;
      }
      if (kind === "information") {
        if (!title.trim()) throw Error("정보 제목을 입력해 주세요.");
        const existing = matches.find((p) => p.kind === "information");
        onApply([
          createInstagramInformation(
            preview.url,
            caption,
            { ...preview.analysis, title: title.trim() },
            existing,
          ),
        ]);
        return;
      }
      onApply(
        createInstagramPlaces(
          places,
          preview.url,
          caption,
          selected.map((index) => candidates[index]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function reanalyze() {
    const analysis = analyzeInstagramCaption(caption);
    showAnalysis(analysis);
    setPreview((p) =>
      p
        ? {
            ...p,
            caption,
            analysis,
            status: caption.trim() ? "available" : "manual",
            message: caption.trim()
              ? "수정한 설명을 다시 분류했습니다."
              : "설명이 없어 확인 대기 링크로 저장합니다.",
          }
        : p,
    );
    setError("");
  }
  return (
    <div className="modal-backdrop instagram-backdrop" onClick={onClose}>
      <section
        className="instagram-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Instagram 릴스 가져오기"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="instagram-header">
          <div>
            <div className="eyebrow">SAVE A REEL</div>
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <label>
              릴스 URL
              <div className="instagram-url">
                <input
                  type="url"
                  required
                  placeholder="https://www.instagram.com/reel/…/"
                  value={url}
                  onChange={(e) => {
                    controller.current?.abort();
                    controller.current = null;
                    setBusy(false);
                    setUrl(e.target.value);
                    setPreview(null);
                    setError("");
                    setCaption("");
                    setCandidates([]);
                    setSelected([]);
                    setTitle("");
                    setTarget(initialTarget ?? "");
                  }}
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={busy || !url.trim()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Instagram size={16} />
                  )}
                  {busy ? "읽는 중…" : "릴스 분석"}
                </button>
              </div>
            </label>
          </form>
          <p className="instagram-help">
            URL을 넣으면 공개 설명에서 장소와 여행 정보를 정리해 드려요.
          </p>
          {error && (
            <p className="instagram-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="instagram-notice" role="status">
              릴스를 읽고 장소·정보를 구분하고 있어요.
            </p>
          )}
          {preview && (
            <>
              <p className="instagram-notice" role="status">
                {preview.message}
              </p>
              <div
                className="instagram-mode"
                role="group"
                aria-label="가져올 내용 분류"
              >
                <button
                  className={kind === "place" ? "active" : ""}
                  aria-pressed={kind === "place"}
                  onClick={() => {
                    setKind("place");
                    if (!candidates.length) {
                      setCandidates([extractInstagramFields("")]);
                      setSelected([0]);
                    }
                  }}
                >
                  <MapPin size={16} /> 장소
                </button>
                <button
                  className={kind === "information" ? "active" : ""}
                  aria-pressed={kind === "information"}
                  onClick={() => setKind("information")}
                >
                  <BookOpen size={16} /> 여행 정보
                </button>
              </div>
              {kind === "place" ? (
                <div className="instagram-candidates">
                  <p className="instagram-help">
                    {candidates.length}개 장소 후보가 있어요. 저장할 항목을
                    선택하세요.
                  </p>
                  {candidates.map((fields, index) => (
                    <div className="instagram-candidate" key={index}>
                      <label className="instagram-candidate-choice">
                        <input
                          type="checkbox"
                          checked={selected.includes(index)}
                          onChange={(e) =>
                            setSelected((current) =>
                              e.target.checked
                                ? [...current, index]
                                : current.filter((i) => i !== index),
                            )
                          }
                        />
                        <span>
                          <strong>
                            {fields.name || "장소 이름 확인 필요"}
                          </strong>
                          <small>{fields.address || "주소 확인 필요"}</small>
                        </span>
                      </label>
                      <details open={!fields.name}>
                        <summary>장소 정보 수정</summary>
                        <div className="instagram-fields">
                          {(
                            [
                              "name",
                              "address",
                              "region",
                              "category",
                              "hours",
                              "price",
                            ] as const
                          ).map((key) => (
                            <label key={key}>
                              {
                                {
                                  name: "장소명",
                                  address: "주소",
                                  region: "지역",
                                  category: "분류",
                                  hours: "영업시간",
                                  price: "가격",
                                }[key]
                              }
                              <input
                                maxLength={500}
                                value={fields[key]}
                                onChange={(e) =>
                                  setCandidates((current) =>
                                    current.map((p, i) =>
                                      i === index
                                        ? { ...p, [key]: e.target.value }
                                        : p,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                  <p className="instagram-help">
                    장소의 지도 위치는 저장 후 주소 검색으로 지정할 수 있어요.
                  </p>
                </div>
              ) : (
                <div className="instagram-information">
                  <span className="tag">
                    {preview.analysis.kind === "unknown"
                      ? "확인 대기"
                      : "여행 정보"}
                  </span>
                  <h3>{title}</h3>
                  <p>
                    {caption
                      ? caption.slice(0, 500)
                      : "릴스 링크를 보관하고 나중에 내용을 확인하세요."}
                  </p>
                  <details>
                    <summary>제목 수정</summary>
                    <input
                      aria-label="정보 제목"
                      maxLength={90}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </details>
                </div>
              )}
              {!!matches.length && (
                <div className="instagram-notice">
                  이 릴스가 연결된 항목이 {matches.length}개 있어요. 같은
                  장소·정보는 기존 항목에 반영합니다.
                </div>
              )}
              <details className="instagram-advanced" open={!!initialTarget}>
                <summary>기존 항목에 연결 / 설명 수정</summary>
                <label>
                  정보를 연결할 항목
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">
                      자동으로 새 항목 추가 또는 중복 병합
                    </option>
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.kind === "information" ? "[정보] " : ""}
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {existingTarget && (
                  <p className="instagram-help">
                    선택한 항목의 기존 정보는 유지하고 이 릴스의 설명과 링크를
                    추가합니다.
                  </p>
                )}
                <label>
                  릴스 설명
                  <textarea
                    rows={5}
                    maxLength={12000}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </label>
                <button className="button small" onClick={reanalyze}>
                  설명 다시 분류
                </button>
              </details>
              <a
                className="text-button instagram-original"
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                릴스 원본 보기
                <ExternalLink size={14} />
              </a>
            </>
          )}
        </div>
        <footer className="instagram-footer">
          <button className="button" onClick={onClose}>
            취소
          </button>
          {preview && (
            <button
              className="button primary"
              disabled={
                busy || (!target && kind === "place" && !selected.length)
              }
              onClick={apply}
            >
              <Check size={17} />
              {existingTarget
                ? "선택한 항목에 정보 추가"
                : kind === "place"
                  ? `${selected.length}개 장소 저장`
                  : preview.analysis.kind === "unknown"
                    ? "확인 대기 링크 저장"
                    : "여행 정보 저장"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
