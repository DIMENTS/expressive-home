// The app runs in a browser, so the project has no Node types. Tests that read files
// from the repository use only these two functions of Node's file module.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string, options: { recursive: true }): string[];
}
