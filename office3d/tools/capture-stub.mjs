#!/usr/bin/env node
import { chromium } from 'playwright';

const target = process.argv[2] ?? 'http://127.0.0.1:3200/town';
const out = process.argv[3] ?? 'capture-stub.png';
const stateFile = process.env.CAPTURE_STUB_STATE;
const zoneFile = process.env.CAPTURE_STUB_ZONE;

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
if (stateFile) await page.route('**/state', async route => route.fulfill({ status: 200, contentType: 'application/json', body: await (await import('node:fs/promises')).readFile(stateFile, 'utf8') }));
if (zoneFile) await page.route('**/zone/routefit', async route => route.fulfill({ status: 200, contentType: 'application/json', body: await (await import('node:fs/promises')).readFile(zoneFile, 'utf8') }));
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForFunction(() => !document.querySelector('#loading') || document.querySelector('#loading.done'), null, { timeout: 90_000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
