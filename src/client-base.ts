import * as ws from 'ws';
import {URL} from 'url';
import * as events from 'events';
import {
  CloseMessage,
  ConnectMessage,
  Control,
  EndpointType,
  HandshakeRequestMessage,
  HandshakeResponseMessage
} from './ws-model';
import {textDecoder, textEncoder} from './utils';

export interface Authentication {
  username: string;
  password: string;
}

export interface CommonClientOptions {
  connectionFactory: () => ws.WebSocket | Promise<ws.WebSocket>;
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

export abstract class AbstractClient<TOPT extends CommonClientOptions> extends events.EventEmitter implements CommonClientEvents {
  protected readonly _options: Partial<TOPT>;
  protected readonly _type: EndpointType;
  protected _connection!: ws.WebSocket;
  protected reconnect: boolean;
  protected readonly channel: string;

  protected constructor(options: Partial<TOPT>, type: EndpointType) {
    super();
    this._options = options;
    this._type = type;
    this.reconnect = options?.reconnect || false;
    this.channel = options.channel!;
  }

  public getConnection(): ws.WebSocket {
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
        return new ws.WebSocket(this._options?.address!);
      })
      .then((socket) => {
        this._connection = socket;
        socket.binaryType = 'nodebuffer';
        socket
          .on('error', (err) => {
            this.emit('error', err);
          })
          .on('open', () => {
            this.handleConnectionOpen(socket);
          })
          .on('message', (msg: Buffer) => {
            this.handleMessage(socket, msg);
          })
          .on('close', (reason) => {
            this.handleClose(socket, reason);
          });
      })
      .catch((err) => {
        this.emit('error', err);
      });
  }

  private doReconnect(reason: number): Promise<void> {
    return Promise.resolve()
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

  private handleConnectionOpen(socket: ws.WebSocket) {
    this.doHandshake(socket);
  }

  protected handleClose(socket: ws.WebSocket, reason: number) {
    this.emit('close', reason);
    if (this.reconnect) {
      this.doReconnect(reason)
        .catch((err) => {
          this.emit('error', err);
        });
    }
  }

  private handleMessage(socket: ws.WebSocket, data: Buffer) {
    try {
      const control = data[0] as Control;
      const payload = data.subarray(1);

      switch (control) {
        case Control.HandshakeResponse:
          this.handleHandshakeResponseMessage(JSON.parse(textDecoder.decode(payload)) as HandshakeResponseMessage);
          break;
        case Control.Connect:
          this.handleConnectMessage(JSON.parse(textDecoder.decode(payload)) as ConnectMessage);
          break;
        case Control.Close:
          this.handleCloseMessage(JSON.parse(textDecoder.decode(payload)) as CloseMessage);
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

  private doHandshake(connection: ws.WebSocket) {
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
          Buffer.from([Control.HandshakeRequest]), textEncoder.encode(JSON.stringify(data))
        ]);
        connection.send(payload);
      });
  }

  private handleRawRelayServerMessage(binaryPayload: Buffer) {
    const sessionId = binaryPayload.subarray(0, 36).toString();
    const data = binaryPayload.subarray(36);
    this.handleRelayServerMessage(sessionId, data);
  }

  protected handleHandshakeResponseMessage(data: HandshakeResponseMessage): void {
    this.emit('handshake');
  }

  protected abstract handleCloseMessage(data: CloseMessage): void;

  protected abstract handleConnectMessage(data: ConnectMessage): void;

  protected abstract handleRelayServerMessage(sessionId: string, data: Buffer): void;

  protected abstract handleRelayClientMessage(data: Buffer): void;
}
