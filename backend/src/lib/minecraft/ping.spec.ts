import { pingJavaModern, pingBedrock } from './ping';
import * as net from 'net';
import * as dgram from 'dgram';

jest.mock('net');
jest.mock('dgram');
jest.mock('dns/promises', () => ({
  resolveSrv: jest.fn().mockResolvedValue(null),
}));

describe('ping', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('pingJavaModern', () => {
    it('should ping a modern java server', async () => {
      const mockSocket = {
        write: jest.fn(),
        on: jest.fn(function (this: any, event: string, cb: () => void) {
          if (event === 'connect') {
            // Trigger the connect callback immediately
            cb();
          } else if (event === 'data') {
            // Setup the data response for later
            this.dataCallback = cb;
          }
          return this;
        }),
        end: jest.fn(),
        destroy: jest.fn(),
        // A function to simulate the server sending data
        __simulateData: function (this: any, data: Buffer) {
          if (this.dataCallback) {
            this.dataCallback(data);
          }
        },
      };

      (net.createConnection as jest.Mock).mockImplementation(() => {
        // Simulate the 'data' event happening after 'connect'
        // This is a more realistic simulation of the net socket behavior
        const response = {
          version: { name: '1.19.4', protocol: 762 },
          players: { online: 5, max: 20 },
          description: { text: 'A Minecraft Server' },
        };
        const jsonResponse = Buffer.from(JSON.stringify(response), 'utf8');
        const mockVarint = {
          encode: (num: number) => {
            const b = Buffer.alloc(4);
            b.writeInt32BE(num, 0);
            return b;
          },
        };
        const responsePacket = Buffer.concat([
          mockVarint.encode(0x00),
          jsonResponse,
        ]);
        const fullPacket = Buffer.concat([
          mockVarint.encode(responsePacket.length),
          responsePacket,
        ]);

        // Use setTimeout to ensure the 'connect' event listener is attached first
        setTimeout(() => mockSocket.__simulateData(fullPacket), 0);

        return mockSocket;
      });

      const manualVarintMock = {
        encode: (num: number) => {
          const b = Buffer.alloc(4);
          b.writeInt32BE(num, 0);
          return b;
        },
        decode: jest.fn().mockImplementation((buf: Buffer) => buf.readInt32BE(0)),
      };

      Object.defineProperty(manualVarintMock.decode, 'bytes', { value: 4 });

      const result = await pingJavaModern(
        'localhost',
        {},
        manualVarintMock as any,
      );
      expect(result.version.name).toBe('1.19.4');
      expect(result.players.online).toBe(5);
    });
  });

  describe('pingBedrock', () => {
    it('should ping a bedrock server', async () => {
      const mockClient = {
        on: jest.fn((event, cb) => {
          if (event === 'message') {
            const responseStr =
              'MCPE;A Bedrock Server;486;1.18.30;10;20;12345;Survival';
            const header = Buffer.alloc(35);
            const body = Buffer.from(responseStr, 'utf8');
            const finalResponse = Buffer.concat([header, body]);
            cb(finalResponse);
          }
        }),
        send: jest.fn((...args) => {
          const cb = args[args.length - 1];
          if (cb) cb();
        }),
        close: jest.fn(),
      };
      (dgram.createSocket as jest.Mock).mockReturnValue(mockClient);

      const result = await pingBedrock('localhost');
      expect(result.motd).toBe('A Bedrock Server');
      expect(result.players.online).toBe(10);
    });
  });
});
