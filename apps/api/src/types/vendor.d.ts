declare module "node-ical" {
  export function parseICS(text: string): Record<string, unknown>;
}

declare module "jschardet" {
  export function detect(buffer: Buffer): { encoding?: string | null; confidence?: number };
}
