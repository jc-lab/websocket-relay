# websocket-relay

# Installation

**YARN**

```bash
$ yarn add @jc-lab/websocket-relay
```

**NPM**

```bash
$ npm install --save @jc-lab/websocket-relay
```

# Usage

See [test/sample.ts](test/sample.ts)

```typescript
import * as net from 'net';
import {
  RelayServer,
  Server,
  Client,
  ChannelConnection,
  ConnectMessage
} from '../src';

const ADDR = '127.0.0.1';

const relay = new RelayServer({
  websocketOptions: {
    noServer: true
  }
});

relay.listen(0, ADDR)
  .then((httpServer) => {
    const PORT = (httpServer.address() as net.AddressInfo).port;
    const server = new Server({
      address: `ws://${ADDR}:${PORT}`,
      channel: 'test01'
    });

    const client = new Client({
      address: `ws://${ADDR}:${PORT}`,
      channel: 'test01'
    });

    server
      .on('handshake', () => {
        console.log('SERVER: handshake');

        client.connect();
      })
      .on('connection', (conn: ChannelConnection) => {
        console.log('SERVER: connection', {
          sessionId: conn.sessionId,
          remoteAddress: conn.remoteAddress
        });
        conn
          .on('close', (reason: number) => {
            console.log('CONNECTION: close', reason);
          })
          .on('data', (data: Buffer) => {
            console.log('CONNECTION: data', data);
          });

        conn.write(Buffer.from([0x02, 0x02]));
      });

    client
      .on('handshake', (data: ConnectMessage) => {
        console.log('CLIENT: handshake', data);

        client.send(Buffer.from([0x01, 0x01]));
      })
      .on('data', (data) => {
        console.log('CLIENT: data', data);
      });

    server.connect();

    console.log('LISTEN 1234');
  });
```

# License

Apache-2.0
