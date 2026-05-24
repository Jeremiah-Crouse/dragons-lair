// src/utils/archive.js
// Handles archive logic via HTTP API

import * as Y from 'yjs';

function getBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:5000';
  return window.location.origin;
}

export async function listArchives() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/archives`);
    const data = await res.json();
    return data.archives || [];
  } catch (e) {
    console.error('Failed to list archives:', e);
    return [];
  }
}

export async function getArchive(date) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/archive/${date}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Failed to get archive:', e);
    return null;
  }
}

export async function getArchiveContent(date) {
  const result = await getArchive(date);
  return result?.content || null;
}

export async function checkAndArchive() {
  const today = new Date().toISOString().split('T')[0];
  const lastDate = localStorage.getItem('lastArchiveDate');
  
  if (lastDate !== today) {
    try {
      const res = await fetch(`${getBaseUrl()}/api/archive-today`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (data.success) {
        localStorage.setItem('lastArchiveDate', today);
        console.log('📦 Archived previous day');
        return { archived: true, date: today };
      }
    } catch (e) {
      console.error('Archive check failed:', e);
    }
  }
  
  return { archived: false };
}

export function isNewDay() {
  const today = new Date().toISOString().split('T')[0];
  const lastDate = localStorage.getItem('lastArchiveDate');
  return lastDate !== today;
}
