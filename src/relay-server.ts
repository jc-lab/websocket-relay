import * as http from 'http';
import * as streams from 'stream';
import * as ws from 'ws';
import * as uuid from 'uuid';
import {RemoteInfo, WebSocketInterface} from './types';
import {
  CloseMessage,
  ConnectMessage,
  Control,
  EndpointType,
  HandshakeRequestMessage, HandshakeResponseMessage,
  ResultCode
} from './ws-model';
import utils from './utils';

export interface RelayConnection {
  closed: boolean;
  sessionId: string;
  server: ClientContext;
  client: ClientContext;
}

export interface ClientContext {
  id: string;
  connection: WebSocketInterface;
  remoteAddress: string | null;
  handshaked: boolean;
  type: EndpointType | null;
  channel: string | null;
  attributes: Record<string, any>;
  relayConnections: RelayConnection[];
}

export interface ChannelContext {
  name: string;
  servers: ClientContext[];
}

export interface RelayServerOptions {
  websocketServer: ws.Server;
  websocketOptions: ws.ServerOptions;
  filterClient: (client: ClientContext, remoteInfo: RemoteInfo) => boolean | Promise<boolean>;
  authorize: (client: ClientContext, params: HandshakeRequestMessage) => boolean | Promise<boolean>;
  onError: (client: ClientContext, err: Error) => void;
}

export class RelayServer {
  private readonly _ws: ws.Server;
  private readonly _options: Partial<RelayServerOptions>;
  private _httpServer: http.Server | null = null;
  private readonly _connections: Record<string, ClientContext> = {};
  private readonly _channels: Record<string, ChannelContext> = {};

  constructor(options?: Partial<RelayServerOptions>) {
    this._ws = options?.websocketServer || new ws.Server(options?.websocketOptions || {});
    this._options = options || {};
  }

  public getWebsocketServer(): ws.Server {
    return this._ws;
  }

  public listen(port: number, host?: string): Promise<http.Server> {
    const httpServer = http.createServer();
    httpServer.on('upgrade', (req, sock, head) => {
      this.handleUpgrade(req, sock, head);
    });
    return new Promise<http.Server>((resolve, reject) => {
      const errorHandler = (err: any) => {
        reject(err);
      };
      httpServer.once('error', errorHandler);
      httpServer.listen(port, host, () => {
        httpServer.off('error', errorHandler);
        resolve(httpServer);
      });
      this._httpServer = httpServer;
    });
  }

  public close(): void {
    if (this._httpServer) {
      this._httpServer.close();
      this._httpServer = null;
    }
    this._ws.close();
  }

  public handleUpgrade(req: http.IncomingMessage, sock: streams.Duplex, upgradeHeader: Buffer) {
    this._ws.handleUpgrade(req, sock, upgradeHeader, (client, request) => {
      this.addClient(client, {
        req: req,
        remoteAddress: request.socket.remoteAddress || null
      });
    });
  }

  public addClient(client: WebSocketInterface, remoteInfo: RemoteInfo): void {
    const context: ClientContext = {
      id: uuid.v4(),
      connection: client,
      remoteAddress: remoteInfo.remoteAddress || null,
      handshaked: false,
      type: null,
      channel: null,
      attributes: {},
      relayConnections: []
    };

    if (!client.on) {
      throw new Error('Not supported WebSocket implementation');
    }

    Promise.resolve()
      .then(() => {
        if (this._options.filterClient) {
          return this._options.filterClient(context, remoteInfo);
        }
        return true;
      })
      .then((allow) => {
        if (!allow) {
          client.close();
        } else {
          this._connections[context.id] = context;
          client.binaryType = 'nodebuffer';
          client.on!('message', (msg: Buffer) => {
            this.handleMessage(context, msg);
          });
          client.on!('close', (reason) => {
            this.handleClose(context, reason);
          });
        }
      });
  }

  private handleClose(context: ClientContext, reason: number) {
    delete this._connections[context.id];
    if (context.type === 'server' && context.channel) {
      this.removeServer(context.channel, context);
    } else if (context.type === 'client') {
      const relay = context.relayConnections[0];
      if (relay && !relay.closed) {
        const index = relay.server.relayConnections.findIndex((v) => v.sessionId === relay.sessionId);
        relay.server.relayConnections.splice(index, 1);

        this.sendCloseMessage(relay.server, relay.sessionId, reason);
      }
    }
  }

  private handleMessage(context: ClientContext, data: Buffer) {
    try {
      const control = data[0] as Control;
      const payload = data.subarray(1);

      switch (control) {
        case Control.HandshakeRequest:
          if (context.handshaked) {
            break;
          }
          this.handleHandshakeRequestMessage(context, payload);
          break;
        case Control.Close:
          this.handleCloseMessage(context, payload);
          break;
        case Control.RelayServerSide:
          this.handleRelayFromServerMessage(context, payload);
          break;
        case Control.RelayClientSide:
          this.handleRelayFromClientMessage(context, payload);
          break;
      }
    } catch (err) {
      if (this._options.onError) {
        this._options.onError(context, err);
      }
    }
  }

  private handleHandshakeRequestMessage(context: ClientContext, binaryPayload: Buffer) {
    const payload = JSON.parse(utils.textDecoder.decode(binaryPayload)) as HandshakeRequestMessage;
    return Promise.resolve()
      .then(() => {
        if (this._options.authorize) {
          return this._options.authorize(context, payload);
        }
        return true;
      })
      .then((allow) => {
        if (!allow) {
          context.connection.close();
        } else {
          context.channel = payload.channel;
          if (payload.type === 'server') {
            context.handshaked = true;
            context.type = 'server';
            const channelContext = this.getChannel(payload.channel);
            channelContext.servers.push(context);
            this.sendHandshakeResponse(context);
          } else if (payload.type == 'client') {
            context.type = 'client';
            const channelContext = this.findChannel(payload.channel);
            if (!channelContext) {
              context.connection.close(ResultCode.BAD_GATEWAY);
            } else {
              let index = Math.floor(Math.random() * channelContext.servers.length);
              if (index >= channelContext.servers.length) {
                index--;
              }
              const server = channelContext.servers[index];
              this.relayPair(server, context);
              context.handshaked = true;
            }
          }
        }
      });
  }

  private handleCloseMessage(context: ClientContext, binaryPayload: Buffer) {
    const data = JSON.parse(utils.textDecoder.decode(binaryPayload)) as CloseMessage;

    if (context.type === 'server') {
      const relayIndex = context.relayConnections.findIndex((v) => v.sessionId === data.sessionId);
      if (relayIndex >= 0) {
        const relay = context.relayConnections[relayIndex];
        context.relayConnections.splice(relayIndex, 1);
        this.closeRelayFromServer(relay);
      }
    } else if (context.type === 'client') {
      context.connection.close(data.reason);
    }
  }

  private handleRelayFromServerMessage(context: ClientContext, binaryPayload: Buffer) {
    if (!context.handshaked || context.type !== 'server') {
      return ;
    }
    const sessionId = binaryPayload.subarray(0, 36).toString();
    const data = binaryPayload.subarray(36);
    const relay = context.relayConnections.find((v) => v.sessionId === sessionId);
    if (relay) {
      this.sendRelayMessageToClient(relay.client, data);
    }
  }

  private handleRelayFromClientMessage(context: ClientContext, binaryPayload: Buffer) {
    if (!context.handshaked || context.type !== 'client') {
      return ;
    }
    const relay = context.relayConnections[0];
    if (relay && !relay.closed) {
      this.sendRelayMessageToServer(relay.server, relay.sessionId, binaryPayload);
    }
  }

  private relayPair(server: ClientContext, client: ClientContext) {
    const relay: RelayConnection = {
      closed: false,
      sessionId: uuid.v4(),
      server,
      client
    };
    server.relayConnections.push(relay);
    client.relayConnections.push(relay);

    this.sendConnectMessage(server, relay.sessionId, client);
    this.sendConnectMessage(client, relay.sessionId, server);
  }

  private sendHandshakeResponse(target: ClientContext) {
    const data: HandshakeResponseMessage = {};
    const payload = Buffer.concat([
      Buffer.from([Control.HandshakeResponse]), utils.textEncoder.encode(JSON.stringify(data))
    ]);
    target.connection.send(payload);
  }

  private sendConnectMessage(target: ClientContext, sessionId: string, remote: ClientContext) {
    const data: ConnectMessage = {
      sessionId,
      remoteAddress: remote.remoteAddress || ''
    };
    const payload = Buffer.concat([
      Buffer.from([Control.Connect]), utils.textEncoder.encode(JSON.stringify(data))
    ]);
    target.connection.send(payload);
  }

  private sendCloseMessage(target: ClientContext, sessionId: string, reason: number) {
    const data: CloseMessage = {
      sessionId,
      reason
    };
    const payload = Buffer.concat([
      Buffer.from([Control.Close]), utils.textEncoder.encode(JSON.stringify(data))
    ]);
    target.connection.send(payload);
  }

  private sendRelayMessageToServer(target: ClientContext, sessionId: string, data: Buffer) {
    const payload = Buffer.concat([
      Buffer.from([Control.RelayServerSide]), utils.textEncoder.encode(sessionId), data
    ]);
    target.connection.send(payload);
  }

  private sendRelayMessageToClient(target: ClientContext, data: Buffer) {
    const payload = Buffer.concat([
      Buffer.from([Control.RelayClientSide]), data
    ]);
    target.connection.send(payload);
  }

  private getChannel(name: string): ChannelContext {
    let context = this._channels[name];
    if (!context) {
      context = {
        name,
        servers: []
      };
      this._channels[name] = context;
    }
    return context;
  }

  private findChannel(name: string): ChannelContext | null {
    return this._channels[name] || null;
  }

  private removeServer(channel: string, context: ClientContext) {
    const channelContext = this._channels[channel];
    if (channelContext) {
      const index = channelContext.servers.findIndex((v) => v.id === context.id);
      channelContext.servers.splice(index, 1);
      if (channelContext.servers.length === 0) {
        delete this._channels[channel];
      }
    }

    context.relayConnections.forEach((relay) => {
      this.closeRelayFromServer(relay);
    });
    context.relayConnections = [];
  }

  private closeRelayFromServer(relay: RelayConnection) {
    relay.closed = true;
    relay.client.connection.close(ResultCode.GOING_AWAY);
  }
}
