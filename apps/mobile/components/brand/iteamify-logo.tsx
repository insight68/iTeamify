/**
 * iteamify product mark — the teal-to-blue glyph from the brand sheet.
 *
 * Same geometry as `apps/web/public/brand/iteamify-icon.svg`,
 * `apps/web/public/favicon.svg` and the lockup in
 * `packages/ui/components/common/iteamify-icon.tsx`. It is duplicated rather
 * than shared because `react-native-svg` needs a different element tree for
 * the same paths; keep the four in sync when the artwork changes.
 *
 * The mark is a colour sweep, so it needs no per-scheme variant to read on
 * light or dark surfaces. Passing `color` flattens it to a single-fill
 * silhouette for decorative use.
 */
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

interface ITeamifyLogoProps {
  size?: number;
  color?: string;
}

/**
 * The artwork is taller than it is wide. Callers pass the height they want, so
 * the width follows the intrinsic ratio instead of forcing a square and
 * letting `preserveAspectRatio` letterbox the mark.
 */
const ASPECT = 141 / 163.78;

export function ITeamifyLogo({ size = 48, color }: ITeamifyLogoProps) {
  const flat = color !== undefined;

  return (
    <Svg width={size * ASPECT} height={size} viewBox="0 0 141 163.78">
      <Defs>
        <LinearGradient
          id="gPill"
          gradientUnits="userSpaceOnUse"
          x1={67}
          y1={-67.9}
          x2={-4.5}
          y2={4.6}
        >
          <Stop offset="0" stopColor="#23F3BF" />
          <Stop offset="0.593" stopColor="#13C69E" />
          <Stop offset="1" stopColor="#0BA288" />
        </LinearGradient>
        <LinearGradient
          id="gA"
          gradientUnits="userSpaceOnUse"
          x1={-57.9}
          y1={35.2}
          x2={9.4}
          y2={-5.7}
        >
          <Stop offset="0" stopColor="#459AFF" />
          <Stop offset="0.431" stopColor="#3078EA" />
          <Stop offset="1" stopColor="#144CA7" />
        </LinearGradient>
        <LinearGradient
          id="gB"
          gradientUnits="userSpaceOnUse"
          x1={49.9}
          y1={5.2}
          x2={107.7}
          y2={11.3}
        >
          <Stop offset="0" stopColor="#2274FF" />
          <Stop offset="1" stopColor="#0A3D77" />
        </LinearGradient>
        <LinearGradient
          id="gH"
          gradientUnits="userSpaceOnUse"
          x1={46.7}
          y1={50.9}
          x2={77.7}
          y2={84.7}
        >
          <Stop offset="0" stopColor="#B8F9F4" />
          <Stop offset="1" stopColor="#2EB3DA" />
        </LinearGradient>
      </Defs>

      <Circle cx={22.45} cy={22.45} r={22.45} fill={flat ? color : "#10D6A3"} />
      <Rect
        x={49.1}
        y={5}
        width={91.9}
        height={52.5}
        rx={26.25}
        fill={flat ? color : "url(#gPill)"}
      />
      <Path
        d="M0,74.95 A22.45,22.45 0 0 1 22.45,52.5 H44.9 V107.85 A22.45,22.45 0 0 1 22.45,130.3 A22.45,22.45 0 0 1 0,107.85 Z"
        fill={flat ? color : "url(#gA)"}
      />
      <Path
        d="M44.9,52.5 H62.2 A29.5,29.5 0 0 1 91.7,82 V140.38 A23.4,23.4 0 0 1 44.9,140.38 Z"
        fill={flat ? color : "url(#gB)"}
      />
      <Path
        d="M44.9,52.5 H62.2 A29.5,29.5 0 0 1 89.28,70.3 L44.9,114.7 Z"
        fill={flat ? color : "url(#gH)"}
      />
    </Svg>
  );
}
