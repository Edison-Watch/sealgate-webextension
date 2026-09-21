import { describe, expect, it } from 'vitest';
import manifest from '../../public/manifest.json';
import { backgroundSites } from './background';
import { contentSites } from './content';

// Manifest V3 host access is static, so every registered site must also be
// listed in the manifest by hand.
describe('site registry and manifest', () => {
  it.each(backgroundSites.map((site) => [site.id, site] as const))(
    'grants host access for the %s background site',
    (_id, site) => {
      expect(manifest.host_permissions).toContain(`${site.origin}/*`);
      for (const url of site.requestFilter.urls) {
        expect(url.startsWith(`${site.origin}/`)).toBe(true);
      }
    },
  );

  it.each(contentSites.map((site) => [site.id, site] as const))(
    'injects the content script into the %s site',
    (_id, site) => {
      expect(
        manifest.content_scripts.flatMap((script) => script.matches),
      ).toContain(`${site.origin}/*`);
    },
  );

  it('runs the React reader in the page main world', () => {
    const pageScript = manifest.content_scripts.find((script) =>
      script.js.includes('assets/page.js'),
    );

    expect(pageScript?.world).toBe('MAIN');
    for (const site of contentSites) {
      expect(pageScript?.matches).toContain(`${site.origin}/*`);
    }
  });
});
