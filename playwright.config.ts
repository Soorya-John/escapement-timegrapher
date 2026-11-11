import {defineConfig} from '@playwright/test';
const url=process.env.ESCAPEMENT_URL||'http://127.0.0.1:4173/escapement-timegrapher/';
export default defineConfig({testDir:'tests/browser',timeout:60000,workers:2,use:{baseURL:url,headless:true},
  webServer:process.env.ESCAPEMENT_URL?undefined:{command:'node scripts/serve.mjs',url,reuseExistingServer:!process.env.CI}});

