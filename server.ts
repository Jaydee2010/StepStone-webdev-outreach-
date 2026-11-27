import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/app.ts';

function readCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const cliPort = Number(readCliArg('--port'));
const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? cliPort
    : Number(process.env.PORT) || 3000;
const HOST = readCliArg('--host') || '0.0.0.0';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter());

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Stepstone Web Agency Brain running on http://localhost:${PORT}`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite middleware:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
