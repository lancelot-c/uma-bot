import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    // Look for test files in the "tests" directory, relative to this configuration file.
    testDir: 'test',

    // Disable test parallelism
    fullyParallel: true,

    // Setting more than 1 worker is likely to push the github actions VM beyond its capacity
    // See https://github.com/microsoft/playwright/issues/19408#issuecomment-1347341819
    workers: 1, 

    // Don't retry failing tests
    retries: 0,

    // Reporter to use
    reporter: 'html',

    use: {
        headless: false,

        // We are using the locally deployed server
        baseURL: 'http://localhost:9999',

        trace: {
            'mode': 'retain-on-first-failure',
            'screenshots': true
        },
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Run your local dev server before starting the tests
    webServer: {
        command: 'npm run serve:test-dapp',
        url: 'http://localhost:9999',
        reuseExistingServer: true
    }
});