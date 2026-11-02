// Workspace tests use the built artifact. The isolated consumer check replaces
// only this bridge with a public package import, retaining the same tests.
export * from '../dist/fesm2022/tandrove-angular.mjs';
