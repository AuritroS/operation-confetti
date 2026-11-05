export type Lane = -1 | 0 | 1;
export type TravelMode = 'swing' | 'run';
export type Direction = 'left' | 'right' | 'up' | 'down';
export const LANES: readonly Lane[] = [-1, 0, 1];
export const laneName = (lane: Lane): string => lane === -1 ? 'Left' : lane === 1 ? 'Right' : 'Middle';
export interface Point3 { x: number; y: number; z: number }
export interface Kinematic { p: Point3; v: Point3; a: Point3 }
export type Phase = 'swing' | 'flight' | 'descend' | 'land' | 'run' | 'launch' | 'transfer';
export interface Anchor extends Point3 { id: string; lane: Lane; kind: 'upper' | 'lower' }
export interface Entity extends Point3 {
  id: string; lane: Lane; kind: 'gift' | 'hazard'; halfX: number; halfY: number; halfZ: number; scored: boolean;
  /** Which assembly to build. Named by the scene, never inferred from size. */
  assembly: import('./config').AssemblyId;
}
export interface Course {
  duration: number; speed: number; laneWidth: number; groundY: number;
  cycle: number; entities: Entity[];
}
export interface RouteSample extends Kinematic { phase: Phase; anchor: Anchor | null }
export interface Snapshot extends RouteSample {
  elapsed: number; lane: Lane; started: boolean; complete: boolean; progress: number;
  transitioning: boolean; protection: number; hitAge: number; selections: number;
  mode: TravelMode; requestedMode: TravelMode; pendingLaunch: boolean; landingAge: number;
}
