import type {
  URL
} from 'url';
import * as events from 'events';
import type WebSocket from 'ws';
import {WebSocketInterface} from './types';
import {
  CloseMessage,
  ConnectMessage,
  Control,
  EndpointType,
  HandshakeRequestMessage,
  HandshakeResponseMessage
} from './ws-model';
import utils from './utils';

const IS_NODEJS = (typeof window === 'undefined');

export interface Authentication {
  username: string;
  password: string;
}

export interface CommonClientOptions {
  websocketImpl: typeof WebSocket;
  connectionFactory: () => WebSocketInterface | Promise<WebSocketInterface>;
  address: string | URL;
  channel: string;
  reconnect: boolean;
  beforeReconnect(closeReason: number): Promise<boolean> | boolean;

  username: string;
  password: string;
  authentication(): Promise<Authentication> | Authentication;
}

export interface CommonClientEvents extends events.EventEmitter {
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  once(eventName: 'handshake', listener: () => void): this;
  once(eventName: 'error', listener: (err: Error) => void): this;
  once(eventName: 'open', listener: () => void): this;
  once(eventName: 'close', listener: (reason: number) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'handshake', listener: () => void): this;
  on(eventName: 'error', listener: (err: Error) => void): this;
  on(eventName: 'open', listener: () => void): this;
  on(eventName: 'close', listener: (reason: number) => void): this;
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  off(eventName: 'handshake', listener: () => void): this;
  off(eventName: 'error', listener: (err: Error) => void): this;
  off(eventName: 'open', listener: (...args: any[]) => void): this;
  off(eventName: 'close', listener: (reason: number) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'handshake'): boolean;
  emit(eventName: 'error', err: Error): boolean;
  emit(eventName: 'open', ...args: any[]): boolean;
  emit(eventName: 'close', reason: number): boolean;
}

function subarray(buffer: ArrayBuffer, start: number, end?: number): ArrayBuffer
function subarray(buffer: Buffer, start: number, end?: number): Buffer
function subarray(buffer: ArrayBuffer | Buffer, start: number, end?: number): ArrayBuffer | Buffer {
  return Buffer.isBuffer(buffer) ? buffer.subarray(start, end) : buffer.slice(start, end);
}

export abstract class AbstractClient<TOPT extends CommonClientOptions> extends events.EventEmitter implements CommonClientEvents {
  protected readonly _options: Partial<TOPT>;
  protected readonly _type: EndpointType;
  protected _connection!: WebSocketInterface;
  protected reconnect: boolean;
  protected readonly channel: string;

  protected backOffTime: number = 1000;
  protected maxBackOffTime: number = 60000;

  protected constructor(options: Partial<TOPT>, type: EndpointType) {
    super();
    this._options = options;
    this._type = type;
    this.reconnect = options?.reconnect || false;
    this.channel = options.channel!;
  }

  public getConnection(): WebSocketInterface {
    return this._connection;
  }

  public connect() {
    return this.doConnect();
  }

  private doConnect() {
    Promise.resolve()
      .then(() => {
        if (this._options?.connectionFactory) {
          return this._options.connectionFactory();
        }
        if (this._options.websocketImpl) {
          return new this._options.websocketImpl(this._options?.address! as any);
        }
        return Promise.reject(new Error('No websocket factory'));
      })
      .then((socket: WebSocketInterface) => {
        let connecting = true;
        this._connection = socket;
        socket.binaryType = (IS_NODEJS ? 'nodebuffer' : 'arraybuffer') as any;

        const handleErrorEvent = (err: any) => {
          if (connecting) {
            this.emit('connectError', err);
          } else {
            this.emit('error');
          }
        };

        if (socket.on) {
          socket.on('error', (err) => {
            handleErrorEvent(err);
          });
          socket.on('open', () => {
            connecting = false;
            this.handleConnectionOpen(socket);
          });
          socket.on('close', (reason) => {
            this.handleClose(socket, reason);
          });
          socket.on('message', (data: Buffer) => {
            this.handleMessage(socket, data);
          });
        } else if (socket.addEventListener) {
          socket.addEventListener('error', (event) => {
            handleErrorEvent(event.error || event);
          });
          socket.addEventListener('open', (event) => {
            connecting = false;
            this.handleConnectionOpen(socket);
          });
          socket.addEventListener('close', (event) => {
            this.handleClose(socket, event.code);
          });
          socket.addEventListener('message', (event) => {
            this.handleMessage(socket, event.data as (Buffer | ArrayBuffer));
          });
        }
      })
      .catch((err) => {
        this.emit('error', err);
      });
  }

  private doReconnect(reason: number): Promise<void> {
    return Promise.resolve()
      .then(() => new Promise<void>((resolve) => {
        const backOffTime = this.backOffTime;
        let nextBackOffTime = this.backOffTime * 2;
        if (nextBackOffTime >= this.maxBackOffTime) {
          nextBackOffTime = this.maxBackOffTime;
        }
        this.backOffTime = nextBackOffTime;
        setTimeout(resolve, backOffTime);
      }))
      .then(() => {
        if (this._options.beforeReconnect) {
          return this._options.beforeReconnect(reason);
        }
        return true;
      })
      .then((allow) => {
        if (!allow) {
          return ;
        }
        this.doConnect();
      });
  }

  private handleConnectionOpen(socket: WebSocketInterface) {
    this.doHandshake(socket);
  }

  protected handleClose(socket: WebSocketInterface, reason: number) {
    this.emit('close', reason);
    if (this.reconnect) {
      this.doReconnect(reason)
        .catch((err) => {
          this.emit('error', err);
        });
    }
  }

  private handleMessage(socket: WebSocketInterface, data: Buffer | ArrayBuffer) {
    try {
      const view = new Uint8Array(data);
      const control = view[0] as Control;
      const payload = subarray(data, 1);

      switch (control) {
        case Control.HandshakeResponse:
          this.handleHandshakeResponseMessage(JSON.parse(utils.textDecoder.decode(payload)) as HandshakeResponseMessage);
          break;
        case Control.Connect:
          this.handleConnectMessage(JSON.parse(utils.textDecoder.decode(payload)) as ConnectMessage);
          break;
        case Control.Close:
          this.handleCloseMessage(JSON.parse(utils.textDecoder.decode(payload)) as CloseMessage);
          break;
        case Control.RelayServerSide:
          this.handleRawRelayServerMessage(payload);
          break;
        case Control.RelayClientSide:
          this.handleRelayClientMessage(payload);
          break;
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  private doHandshake(connection: WebSocketInterface) {
    return Promise.resolve()
      .then(() => {
        if (this._options.authentication) {
          return this._options.authentication();
        } else {
          return {
            username: this._options.username!,
            password: this._options.password!
          };
        }
      })
      .then((auth: Authentication) => {
        const data: HandshakeRequestMessage = {
          type: this._type,
          channel: this.channel,
          username: auth.username,
          password: auth.password
        };
        const payload = Buffer.concat([
          Buffer.from([Control.HandshakeRequest]), utils.textEncoder.encode(JSON.stringify(data))
        ]);
        connection.send(payload);
      });
  }

  private handleRawRelayServerMessage(binaryPayload: Buffer | ArrayBuffer) {
    const sessionId = utils.textDecoder.decode(subarray(binaryPayload, 0, 36));
    const data = subarray(binaryPayload, 36);
    this.handleRelayServerMessage(sessionId, data);
  }

  protected handleHandshakeResponseMessage(data: HandshakeResponseMessage): void {
    this.emit('handshake');
  }

  protected abstract handleCloseMessage(data: CloseMessage): void;

  protected abstract handleConnectMessage(data: ConnectMessage): void;

  protected abstract handleRelayServerMessage(sessionId: string, data: Buffer | ArrayBuffer): void;

  protected abstract handleRelayClientMessage(data: Buffer | ArrayBuffer): void;
}
