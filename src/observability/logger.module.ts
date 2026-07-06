import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const existing = req.headers['x-correlation-id'];
          const id =
            typeof existing === 'string' && existing.length > 0
              ? existing
              : randomUUID();
          res.setHeader('x-correlation-id', id);
          return id;
        },
        customProps: () => ({ context: 'HTTP' }),
        autoLogging: true,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
          ],
          remove: true,
        },
      },
    }),
  ],
})
export class AppLoggerModule {}
