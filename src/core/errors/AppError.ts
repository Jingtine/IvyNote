export type AppErrorCode =
  | "fileNotFound"
  | "permissionDenied"
  | "invalidPath"
  | "unsupportedEncoding"
  | "externalModificationConflict"
  | "io";

export interface AppErrorPayload {
  code: AppErrorCode;
  message: string;
  path?: string;
}
