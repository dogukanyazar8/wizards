import type { ReactElement } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
  MOBILE_LINE_ICON_DEFINITIONS,
  type MobileLineIconChildDefinition,
  type MobileLineIconDefinition,
  type MobileLineIconName,
} from "./mobile-line-icon-definitions";

export type { MobileLineIconName } from "./mobile-line-icon-definitions";

export interface MobileLineIconProps {
  readonly accessibilityLabel?: string;
  readonly color: string;
  readonly name: MobileLineIconName;
  readonly size?: number;
  readonly strokeWidth?: number;
}

function renderIconChild(
  child: MobileLineIconChildDefinition,
  index: number,
  strokeWidthOverride?: number,
): ReactElement {
  const key = `${child.type}-${index}`;
  const childStrokeWidth = strokeWidthOverride ?? child.strokeWidth;
  const childStrokeProps = childStrokeWidth === undefined ? {} : { strokeWidth: childStrokeWidth };

  switch (child.type) {
    case "circle":
      return <Circle key={key} cx={child.cx} cy={child.cy} r={child.r} {...childStrokeProps} />;
    case "rect":
      return (
        <Rect
          key={key}
          height={child.height}
          rx={child.rx}
          width={child.width}
          x={child.x}
          y={child.y}
          {...childStrokeProps}
        />
      );
    default:
      return <Path key={key} d={child.d} {...childStrokeProps} />;
  }
}

function renderIconChildren(
  definition: MobileLineIconDefinition,
  strokeWidthOverride?: number,
): readonly ReactElement[] {
  return definition.children.map((child, index) =>
    renderIconChild(child, index, definition.mode === "stroke" ? strokeWidthOverride : undefined),
  );
}

export function MobileLineIcon({
  accessibilityLabel,
  color,
  name,
  size = 20,
  strokeWidth,
}: MobileLineIconProps) {
  const definition = MOBILE_LINE_ICON_DEFINITIONS[name];
  const isStrokeIcon = definition.mode === "stroke";
  const accessibilityProps = accessibilityLabel
    ? {
        accessibilityElementsHidden: false,
        accessibilityLabel,
        accessibilityRole: "image" as const,
        accessible: true,
        importantForAccessibility: "yes" as const,
      }
    : {
        accessibilityElementsHidden: true,
        accessible: false,
        importantForAccessibility: "no-hide-descendants" as const,
      };
  const renderingProps = isStrokeIcon
    ? {
        fill: "none",
        stroke: color,
        strokeWidth: strokeWidth ?? definition.defaultStrokeWidth,
        ...(definition.strokeLinecap === undefined
          ? {}
          : { strokeLinecap: definition.strokeLinecap }),
        ...("strokeLinejoin" in definition ? { strokeLinejoin: definition.strokeLinejoin } : {}),
      }
    : { fill: color, stroke: "none" };

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size} {...accessibilityProps} {...renderingProps}>
      {renderIconChildren(definition, strokeWidth)}
    </Svg>
  );
}
