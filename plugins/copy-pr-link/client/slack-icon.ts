import { createElement } from "react";
import { View } from "react-native";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";

// Lucide no longer provides brand icons; draw Slack's mark with native primitives.
export function SlackIcon({ size, color }: PluginButtonIconProps) {
  const scale = size / 24;
  const pieces = [
    [5, 0, 4, 4], [0, 5, 9, 4],
    [20, 5, 4, 4], [15, 0, 4, 9],
    [15, 20, 4, 4], [15, 15, 9, 4],
    [0, 15, 4, 4], [5, 15, 4, 9],
  ];
  return createElement(View, { style: { width: size, height: size }, pointerEvents: "none", accessible: false },
    pieces.map(([x, y, width, height], key) => createElement(View, { key, style: {
      position: "absolute", left: x * scale, top: y * scale,
      width: width * scale, height: height * scale,
      borderRadius: 2 * scale, backgroundColor: color,
    } })),
  );
}
