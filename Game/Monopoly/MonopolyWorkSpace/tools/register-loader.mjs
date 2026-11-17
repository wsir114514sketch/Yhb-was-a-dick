import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register(pathToFileURL('tools/asset-loader.mjs'), { parentURL: import.meta.url });
