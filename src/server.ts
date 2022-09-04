import * as streams from 'stream';
import * as events from 'events';
import * as ws from 'ws';
import {CloseMessage, ConnectMessage, Control, ResultCode} from './ws-model';
import {AbstractClient, CommonClientEvents, CommonClientOptions} from './client-base';
import {textEncoder} from './utils';


export interface ChannelConnectionEvents extends events.EventEmitter {
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  once(eventName: 'close', listener: (reason: number) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'close', listener: (reason: number) => void): this;
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  off(eventName: 'close', listener: (reason: number) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'close', reason: number): boolean;
}

export class ChannelConnection extends streams.Duplex implements ChannelConnectionEvents {
  public readonly server: Server;
  public readonly sessionId: string;
  public readonly remoteAddress: string;

  constructor(opts: streams.DuplexOptions, server: Server, sessionId: string, remoteAddress: string) {
    super(opts);
    this.server = server;
    this.sessionId = sessionId;
    this.remoteAddress = remoteAddress;
  }

  public close(reason: number) {
    this.server.closeSession(this.sessionId, reason);
  }

  _write(chunk: any, encoding: BufferEncoding, callback: (error?: (Error | null)) => void) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this.server.sendTo(this.sessionId, buffer, callback);
  }

  _read(size: number) {
  }

  _final(callback: (error?: (Error | null)) => void) {
    this.server.closeSession(this.sessionId, ResultCode.OK, callback);
  }
}

export interface ServerOptions extends CommonClientOptions {

}

export interface ServerEvents extends CommonClientEvents {
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  once(eventName: 'connection', listener: (connection: ChannelConnection) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'connection', listener: (connection: ChannelConnection) => void): this;
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  off(eventName: 'connection', listener: (connection: ChannelConnection) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'connection', connection: ChannelConnection): boolean;
}

export class Server extends AbstractClient<ServerOptions> implements ServerEvents {
  private readonly _connections: Record<string, ChannelConnection> = {};

  constructor(options: Partial<ServerOptions>) {
    super(options, 'server');
  }

  public sendTo(sessionId: string, data: Buffer, cb?: (err?: Error) => void) {
    const payload = Buffer.concat([
      Buffer.from([Control.RelayServerSide]), textEncoder.encode(sessionId), data
    ]);
    this._connection.send(payload, cb);
  }

  public closeSession(sessionId: string, reason: number, cb?: (err?: Error) => void) {
    const data: CloseMessage = {
      sessionId,
      reason
    };
    const payload = Buffer.concat([
      Buffer.from([Control.Close]), textEncoder.encode(JSON.stringify(data))
    ]);
    this._connection.send(payload, cb);
  }

  protected handleClose(socket: ws.WebSocket, reason: number) {
    Object.keys(this._connections)
      .forEach((sessionId) => {
        const connection = this._connections[sessionId];
        delete this._connections[sessionId];
        connection.emit('close', ResultCode.GOING_AWAY);
      });
    super.handleClose(socket, reason);
  }

  protected handleConnectMessage(data: ConnectMessage): void {
    const connection = new ChannelConnection(
      {},
      this,
      data.sessionId,
      data.remoteAddress
    );
    this._connections[connection.sessionId] = connection;
    this.emit('connection', connection);
  }

  protected handleCloseMessage(data: CloseMessage): void {
    const connection = this._connections[data.sessionId];
    if (connection) {
      delete this._connections[data.sessionId];
      connection.emit('close', data.reason);
    }
  }

  protected handleRelayClientMessage(data: Buffer): void {
    // nothing
  }

  protected handleRelayServerMessage(sessionId: string, data: Buffer): void {
    const connection = this._connections[sessionId];
    if (connection) {
      delete this._connections[sessionId];
      connection.emit('data', data);
    }
  }
}
