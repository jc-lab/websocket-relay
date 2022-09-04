// Binary Protocol
// offset size desciption
//      0    1 CONTROL
//      1   36 session-id (TEXT) | RelayFromServer only
//      1  end PAYLOAD
export enum ResultCode {
  OK = 1000,
  GOING_AWAY = 1001,
  BAD_GATEWAY = 1014,
}

export enum Control {
  HandshakeRequest = 0x01,
  HandshakeResponse = 0x02,
  Connect = 0x10,
  Close = 0x1a,
  RelayServerSide = 0x21,
  RelayClientSide = 0x22,
}

export type EndpointType = 'server' | 'client';

export interface HandshakeRequestMessage {
  type: EndpointType;
  username: string;
  password: string;
  channel: string;
}

export interface HandshakeResponseMessage {}

export interface ConnectMessage {
  sessionId: string;
  remoteAddress: string;
}

export interface CloseMessage {
  sessionId: string;
  reason: number;
}
