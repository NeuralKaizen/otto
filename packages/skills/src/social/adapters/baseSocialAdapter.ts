import type { SocialProfileMetrics } from "../types.js";

export interface SocialAdapter {
  platform: "instagram" | "tiktok" | "youtube";
  isAvailable(): boolean;
  fetchProfileMetrics(username: string): Promise<SocialProfileMetrics>;
}

export interface SocialAdapterErrorOptions {
  code: string;
  recoverable?: boolean;
  statusCode?: number;
}

export class SocialAdapterError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly statusCode?: number;

  constructor(message: string, options: SocialAdapterErrorOptions) {
    super(message);
    this.name = "SocialAdapterError";
    this.code = options.code;
    this.recoverable = options.recoverable ?? true;
    this.statusCode = options.statusCode;
  }
}
