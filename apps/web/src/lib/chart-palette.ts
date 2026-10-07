/**
 * Chart colours, as literal hex so SVG attributes resolve everywhere.
 *
 * The categorical set was validated against the white card surface: lightness
 * band, chroma floor, colour-blind separation and normal-vision separation all
 * pass. Three of the slots sit below 3:1 contrast on white, so every chart
 * drawn with them ships a legend or direct value labels — colour alone never
 * carries the meaning.
 */
export const SERIES = {
  primary: "#4f46e5",
  secondary: "#1baf7a",
  third: "#eb6834",
  fourth: "#eda100",
  fifth: "#e87ba4",
} as const;

/** Ordered slots for charts that need an arbitrary number of categories. */
export const SERIES_ORDER = [
  SERIES.primary,
  SERIES.third,
  SERIES.secondary,
  SERIES.fourth,
  SERIES.fifth,
] as const;

/** Workflow states keep the same colours they wear everywhere else in the app. */
export const STATUS_COLOR: Record<string, string> = {
  PLACED: "#b8860b",
  IN_PROGRESS: "#4f46e5",
  TRANSFERRED: "#8c93a3",
  COMPLETED: "#0b8f7c",
  REJECTED: "#c0392f",
  CANCELLED: "#c3c7d0",
};

export const CHART_GRID = "#eceef2";
export const CHART_AXIS = "#667085";
