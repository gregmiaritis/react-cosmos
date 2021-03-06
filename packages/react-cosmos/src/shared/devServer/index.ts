import http from 'http';
import express from 'express';
import { CosmosConfig, getCosmosConfig } from '../../config';
import { PlatformType } from '../shared';
import { serveStaticDir } from '../static';
import { createHttpServer } from './httpServer';
import { createApp } from './app';

type PluginCleanupCallback = () => unknown;
type PluginReturn = void | null | PluginCleanupCallback;

export type DevServerPluginArgs = {
  cosmosConfig: CosmosConfig;
  httpServer: http.Server;
  expressApp: express.Express;
};

export type DevServerPlugin = (
  args: DevServerPluginArgs
) => PluginReturn | Promise<PluginReturn>;

export async function startDevServer(
  platformType: PlatformType,
  plugins: DevServerPlugin[] = []
) {
  const cosmosConfig = getCosmosConfig();

  const app = createApp(platformType, cosmosConfig);
  if (cosmosConfig.staticPath) {
    serveStaticDir(app, cosmosConfig.staticPath, cosmosConfig.publicUrl);
  }

  const pluginCleanupCallbacks: PluginCleanupCallback[] = [];
  const httpServer = createHttpServer(cosmosConfig, app);
  await httpServer.start();

  async function cleanUp() {
    await pluginCleanupCallbacks.map(cleanup => cleanup());
    await httpServer.stop();
  }

  try {
    for (const plugin of plugins) {
      const pluginReturn = await plugin({
        cosmosConfig,
        httpServer: httpServer.server,
        expressApp: app
      });
      if (typeof pluginReturn === 'function') {
        pluginCleanupCallbacks.push(pluginReturn);
      }
    }
  } catch (err) {
    cleanUp();
    throw err;
  }

  return cleanUp;
}
