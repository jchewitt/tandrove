// Public DestroyRef.destroyed first appeared in Angular 20.1.0. Build on that
// floor; exercise the SAME packed output at each supported major's boundaries.
export const angularPeerRange = '^20.1.0 || ^21.0.0 || ^22.0.0';
export const angularCompatibilityTargets = [
  { angular: '20.1.0', typescript: '5.8.3' },
  { angular: '20.3.34', typescript: '5.9.3' },
  { angular: '21.0.0', typescript: '5.9.3' },
  { angular: '21.2.17', typescript: '5.9.3' },
  { angular: '21.2.25', typescript: '5.9.3' },
  { angular: '22.0.0', typescript: '6.0.3' },
  { angular: '22.2.4', typescript: '6.0.3' },
];
export const angularBuildTarget = angularCompatibilityTargets[0];

export function angularTarget(version) {
  const target = angularCompatibilityTargets.find(
    (candidate) => candidate.angular === version,
  );
  if (!target)
    throw new Error(`Unknown Angular compatibility target: ${version}`);
  return target;
}
