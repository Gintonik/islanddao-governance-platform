/**
 * Deployment Entry Point - ES Module format
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('./index.cjs');