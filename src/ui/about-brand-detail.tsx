import type { Locale } from "../i18n/locale.ts";

const detail = [
  58, 235, 207, 172, 156, 258, 339, 329, 314, 287, 498, 432, 396, 388, 611, 605,
  577, 36231, 19579, 39661, 64953, 30603, 31798, 19564, 19909, 13124, 867, 966,
  1010, 968, 1015, 909, 1150, 1115, 1127, 1096, 1266, 1227, 1227, 1204, 1241,
  1402, 1372, 1318, 1288, 1444,
];

export function AboutBrandDetail({ locale }: { locale: Locale }) {
  const text = String.fromCharCode(
    ...detail.map((value, index) => value ^ ((0x71 + index * 29) & 0xffff)),
  ).split("\0");
  return (
    <div className="about-brand-detail" role="status">
      <div className="about-brand-marks">
        <span>{text[0]}</span>
        <span>{text[1]}</span>
        <span>{text[2]}</span>
      </div>
      <p>{text[locale === "zh-CN" ? 3 : 4]}</p>
    </div>
  );
}
