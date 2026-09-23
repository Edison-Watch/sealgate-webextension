import { mount } from 'svelte';
import './theme.css';
import App from './App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Popup mount point was not found.');
}

mount(App, { target });
