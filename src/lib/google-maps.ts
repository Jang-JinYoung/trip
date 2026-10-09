import { hasCoordinates, locationLabel, safeUrl, type Place } from "./places";

export function googleMapsUrl(place: Place) {
  const existing = safeUrl(place.mapUrl);
  if (existing) {
    const host = new URL(existing).hostname;
    if (
      host === "google.com" ||
      host === "www.google.com" ||
      host === "maps.google.com" ||
      host === "maps.app.goo.gl"
    )
      return existing;
  }
  const query = hasCoordinates(place)
    ? `${place.lat},${place.lng}`
    : [place.name, place.address, place.region].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function myMapsCsvExport(places: Place[]) {
  const escape = (value: string | number) => {
    // Numeric coordinates must remain numeric, including southern/western ones.
    let text = String(value);
    if (typeof value === "string" && /^\s*[=+@\-\t\r]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows: (string | number)[][] = [
    [
      "ID",
      "장소명",
      "위도",
      "경도",
      "지역",
      "분류",
      "주소",
      "설명",
      "메모",
      "방문상태",
      "희망일",
      "위치 정확도",
      "Google 지도",
      "출처",
    ],
    ...places
      .filter(hasCoordinates)
      .map((p) => [
        p.id,
        p.name,
        p.lat!,
        p.lng!,
        p.region,
        p.category,
        p.address,
        [
          p.description,
          p.hours && `영업시간: ${p.hours}`,
          p.price && `가격: ${p.price}`,
          p.caution && `주의: ${p.caution}`,
        ]
          .filter(Boolean)
          .join("\n"),
        p.note,
        p.status,
        p.day,
        locationLabel(p),
        googleMapsUrl(p),
        [
          ...new Set(
            [p.sourceUrl, ...(p.instagramSources ?? []).map((s) => s.url)]
              .map(safeUrl)
              .filter(Boolean),
          ),
        ].join("\n"),
      ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
