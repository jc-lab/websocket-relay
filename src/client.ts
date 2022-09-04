import {
  CloseMessage,
  ConnectMessage, Control
} from './ws-model';
import {
  AbstractClient,
  CommonClientEvents,
  CommonClientOptions
} from './client-base';
import {textEncoder} from './utils';

export interface ClientOptions extends CommonClientOptions {
}

export interface ClientEvents extends CommonClientEvents {
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  once(eventName: 'handshake', listener: (data: ConnectMessage) => void): this;
  once(eventName: 'data', listener: (data: Buffer) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: 'handshake', listener: (data: ConnectMessage) => void): this;
  on(eventName: 'data', listener: (data: Buffer) => void): this;
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  off(eventName: 'handshake', listener: (data: ConnectMessage) => void): this;
  off(eventName: 'data', listener: (data: Buffer) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventName: 'handshake', data: ConnectMessage): boolean;
  emit(eventName: 'data', data: Buffer): boolean;
}

export class Client extends AbstractClient<ClientOptions> implements ClientEvents {
  constructor(options: Partial<ClientOptions>) {
    super(options, 'client');
  }

  public send(data: Buffer, cb?: (err?: Error) => void) {
    const payload = Buffer.concat([
      Buffer.from([Control.RelayClientSide]), data
    ]);
    this._connection.send(payload, cb);
  }

  protected handleConnectMessage(data: ConnectMessage): void {
    this.emit('handshake', data);
  }

  protected handleCloseMessage(data: CloseMessage): void {
    // nothing
  }

  protected handleRelayClientMessage(data: Buffer): void {
    this.emit('data', data);
  }

  protected handleRelayServerMessage(sessionId: string, data: Buffer): void {
    // nothing
  }
}
