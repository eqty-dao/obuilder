import * as path from 'path';
import * as fs from 'fs';

// Load package.json once at startup
const packageJsonPath = path.join(process.cwd(), 'package.json');
export const packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Optional: Add helper functions to get specific values
export function getPackagePath(key: string): string {
  return packageInfo[key];
}