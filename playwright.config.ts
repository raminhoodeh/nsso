import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
    timeout: 30_000,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    outputDir: 'private/test-results/browser',
    reporter: [['list'], ['json', { outputFile: 'private/test-results/browser-results.json' }]],
    use: {
        browserName: 'chromium',
        channel: process.env.CI ? undefined : 'chrome',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
        { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ],
})
