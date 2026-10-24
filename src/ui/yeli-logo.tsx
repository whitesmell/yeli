import { yeliAccent, yeliLogo, yeliMarkTransform } from "../brand/yeli-logo.ts";

export function YeliLogo({ expanded = false }: { expanded?: boolean }) {
  return (
    <svg
      className="yeli-logo"
      viewBox={yeliLogo.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <g data-yeli-monogram="" transform={yeliMarkTransform(expanded)}>
        <path fillRule="evenodd" d={yeliLogo.monogram} />
        <path
          data-yeli-accent=""
          fill={yeliAccent}
          fillRule="evenodd"
          d={yeliLogo.monogramAccent}
        />
      </g>
      <g data-yeli-wordmark="">
        <path fillRule="evenodd" d={yeliLogo.wordmark} />
        <path
          data-yeli-accent=""
          fill={yeliAccent}
          d={yeliLogo.wordmarkAccent}
        />
        <circle data-yeli-accent="" fill={yeliAccent} {...yeliLogo.dot} />
      </g>
    </svg>
  );
}
