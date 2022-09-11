import type WebSocket from 'ws';
import type * as http from 'http';

export interface WebSocketInterface {
  binaryType: string;

  addEventListener?(event: 'open', listener: (event: any) => void): void;
  addEventListener?(event: 'message', listener: (event: any) => void): void;
  addEventListener?(event: 'close', listener: (event: any) => void): void;
  addEventListener?(event: 'error', listener: (event: any) => void): void;
  addEventListener?(event: string, listener: (event: any) => void): void;

  on?(event: 'open', listener: () => void): this;
  on?(event: 'message', listener: (data: WebSocket.RawData, isBinary: boolean) => void): this;
  on?(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on?(event: 'error', listener: (err: Error) => void): this;
  // on?(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
  on?(event: string, listener: any): void;

  send(data: any, cb?: (err?: Error) => void): void;
  close(reason?: number): void;
}

export interface RemoteInfo {
  req?: http.IncomingMessage;
  remoteAddress: string | null;
}
