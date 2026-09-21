import { contentSites } from '../sites/content';
import { startMainWorldScanning } from './page-bridge';

const site = contentSites.find(
  (candidate) => candidate.origin === window.location.origin,
);

if (site) {
  startMainWorldScanning(site);
}
