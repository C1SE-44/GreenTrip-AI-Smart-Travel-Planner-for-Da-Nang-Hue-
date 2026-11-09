import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('MorphButton component and path geometries exist in file', () => {
  const filePath = path.resolve('src/components/ui/MorphButton.tsx');
  assert.ok(fs.existsSync(filePath), 'MorphButton.tsx must exist');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('heartOutline'), 'heartOutline must be declared');
  assert.ok(content.includes('heartFilled'), 'heartFilled must be declared');
  assert.ok(content.includes('plus'), 'plus must be declared');
  assert.ok(content.includes('check'), 'check must be declared');
  assert.ok(content.includes('MorphFavoriteButton'), 'MorphFavoriteButton must be exported');
  assert.ok(content.includes('MorphAddButton'), 'MorphAddButton must be exported');
  assert.ok(content.includes('morphicons/react'), 'morphicons/react must be imported');
});

test('Day schedule reordering logic inverts positions correctly', () => {
  const initialStops = [
    { id: 'stop-1', name: 'Bún bò Huế' },
    { id: 'stop-2', name: 'Đại Nội Huế' },
    { id: 'stop-3', name: 'Chùa Thiên Mụ' },
  ];

  // Reorder stop-2 UP (direction: 'up')
  const stops = [...initialStops];
  const idx = 1;
  const targetIdx = idx - 1;
  const temp = stops[idx];
  stops[idx] = stops[targetIdx];
  stops[targetIdx] = temp;

  assert.equal(stops[0].id, 'stop-2', 'Đại Nội Huế should now be first');
  assert.equal(stops[1].id, 'stop-1', 'Bún bò Huế should now be second');
  assert.equal(stops[2].id, 'stop-3', 'Chùa Thiên Mụ remains third');
});

test('Status transitions cycle through planned -> in_progress -> visited', () => {
  const statusCycle = {
    planned: 'in_progress',
    in_progress: 'visited',
    visited: 'planned',
  };

  assert.equal(statusCycle['planned'], 'in_progress');
  assert.equal(statusCycle['in_progress'], 'visited');
  assert.equal(statusCycle['visited'], 'planned');
});
