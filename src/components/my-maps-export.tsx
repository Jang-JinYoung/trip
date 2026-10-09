"use client";

import { useRef } from "react";
import { Download, ExternalLink, Map, X } from "lucide-react";
import { hasCoordinates, type Place } from "@/lib/places";
import { myMapsCsvExport } from "@/lib/google-maps";

export default function MyMapsExport({ places }: { places: Place[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const located = places.filter(hasCoordinates);
  const unlocated = places.filter(
    (p) => p.kind !== "information" && !hasCoordinates(p),
  ).length;
  const batches = Array.from(
    { length: Math.ceil(located.length / 2000) },
    (_, index) => located.slice(index * 2000, (index + 1) * 2000),
  );
  function download(batch: Place[], index: number) {
    const url = URL.createObjectURL(
      new Blob([myMapsCsvExport(batch)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `Google-My-Maps${batches.length > 1 ? `-${index + 1}` : ""}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <button className="button" onClick={() => dialog.current?.showModal()}>
        <Map size={17} /> 내 Google 지도로
      </button>
      <dialog
        ref={dialog}
        className="my-maps-dialog"
        aria-labelledby="my-maps-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              dialog.current?.close();
          }
        }}
      >
        <button
          autoFocus
          className="icon-button modal-close"
          aria-label="닫기"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        <span className="stat-icon blue">
          <Map size={24} />
        </span>
        <h2 id="my-maps-title">내 Google 지도에 장소 모으기</h2>
        <p>
          전체 목록 중 위치가 있는 <strong>{located.length}개</strong>를
          내보냅니다. 장소 설명·메모·출처도 포함됩니다.
        </p>
        {!!unlocated && (
          <p className="setup-note">
            위치 미지정 {unlocated}개는 좌표를 지정한 뒤 추가할 수 있습니다.
            여행 정보는 지도 내보내기에서 제외됩니다.
          </p>
        )}
        <ol>
          <li>아래에서 CSV 파일을 내려받으세요.</li>
          <li>
            Google 내 지도에서 <strong>새 지도 만들기 → 가져오기</strong>를
            누르고 파일을 선택하세요.
          </li>
          <li>
            위치 열은 <strong>위도·경도</strong>, 제목 열은{" "}
            <strong>장소명</strong>으로 지정하세요.
          </li>
          <li>
            같은 계정의 Google 지도 앱에서 <strong>나 → 지도</strong>를 열면 볼
            수 있습니다.
          </li>
        </ol>
        {batches.map((batch, index) => (
          <button
            key={index}
            className="button primary full"
            onClick={() => download(batch, index)}
          >
            <Download size={16} />
            {batches.length > 1 ? `${index + 1}번 파일 · ` : ""}
            {batch.length}개 장소 CSV 다운로드
          </button>
        ))}
        {!located.length && <p>먼저 장소에 위치를 지정해 주세요.</p>}
        {batches.length > 1 && (
          <p>
            가져오기 한도에 맞춰 2,000개씩 나눴습니다. 파일마다 별도 레이어로
            가져오세요.
          </p>
        )}
        <a
          className="button full"
          href="https://www.google.com/maps/d/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google 내 지도 열기 <ExternalLink size={15} />
        </a>
        <p className="setup-note">
          ‘가고 싶은 곳’ 저장 목록과는 별도의 맞춤 지도입니다. 변경 사항은 자동
          동기화되지 않습니다. 다시 가져올 때 ID 열로 일치시키면 기존 장소를
          갱신할 수 있습니다.
        </p>
      </dialog>
    </>
  );
}
