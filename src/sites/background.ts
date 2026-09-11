import { chatgptBackground } from './chatgpt/background';
import { claudeBackground } from './claude/background';
import type { BackgroundSite } from './types';

export const backgroundSites: readonly BackgroundSite[] = [
  chatgptBackground,
  claudeBackground,
];
