import { chatgptContent } from './chatgpt/content';
import { claudeContent } from './claude/content';
import type { ContentSite } from './types';

export const contentSites: readonly ContentSite[] = [
  chatgptContent,
  claudeContent,
];
