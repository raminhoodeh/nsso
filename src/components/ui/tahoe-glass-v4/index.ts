export {
  TahoeGlassV4Button,
  TahoeGlassV4Surface,
  type TahoeGlassV4ButtonProps,
  type TahoeGlassV4ContentTone,
  type TahoeGlassV4SemanticTint,
  type TahoeGlassV4SurfaceElement,
  type TahoeGlassV4SurfaceProps,
  type TahoeGlassV4SurfaceVariant,
} from "./TahoeGlassV4Surface";

export {
  TahoeGlassV4Diagnostics,
  type TahoeGlassV4DebugSurface,
  type TahoeGlassV4DiagnosticsProps,
} from "./TahoeGlassV4Diagnostics";

export {
  TahoeGlassV4Provider,
  useTahoeGlassV4Diagnostics,
  useTahoeGlassV4Controls,
  type TahoeGlassV4Controls,
  type TahoeGlassV4ProviderProps,
  type TahoeGlassV4SurfaceRegistration,
} from "@/components/providers/TahoeGlassV4Provider";

export type {
  TahoeV4Backend,
  TahoeV4Diagnostics,
  TahoeV4Lifecycle,
  TahoeV4Profile,
  TahoeV4SceneSource,
} from "@/lib/tahoe-glass/v4";
