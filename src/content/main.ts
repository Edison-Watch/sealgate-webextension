import { contentSites } from '../sites/content';
import { startTracking } from './runtime';

const site = contentSites.find(
  (candidate) => candidate.origin === window.location.origin,
);

if (site) {
  startTracking(site);
}
