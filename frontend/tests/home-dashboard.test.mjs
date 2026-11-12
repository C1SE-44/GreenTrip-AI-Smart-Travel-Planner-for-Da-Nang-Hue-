import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const homeViewPath = path.resolve('src/components/home/HomeDashboardView.tsx');
const explorePagePath = path.resolve('src/pages/ExplorePage.tsx');
const appPath = path.resolve('src/App.tsx');

test('Home View: ExplorePage includes Trang chủ navigation item in sidebar', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(content.includes("key: 'home'"), 'Must contain home key in navigation list');
  assert.ok(content.includes("label: 'Trang chủ'"), 'Must label home as Trang chủ');
  assert.ok(content.includes("initialView?: 'home' | 'explore' | 'trips' | 'saved'"), 'Must support home initialView');
});

test('Home View: App.tsx routes include /home', () => {
  const content = fs.readFileSync(appPath, 'utf8');
  assert.ok(content.includes('path="/home"'), 'Must define /home route in App.tsx');
});

test('Home View: HomeDashboardView renders 4 cards & Assistant setup matching Mindtrip', () => {
  const content = fs.readFileSync(homeViewPath, 'utf8');
  
  // Card 1: Hoàn tất thiết lập trợ lý
  assert.ok(content.includes('Hoàn tất thiết lập trợ lý'), 'Must have Card 1: Hoàn tất thiết lập trợ lý');
  assert.ok(content.includes('setIsOnboardingOpen(true)'), 'Card 1 must open OnboardingModal');
  
  // Card 2: Gợi ý lý tưởng chuyên sâu
  assert.ok(content.includes('Gợi ý lý tưởng chuyên sâu'), 'Must have Card 2: Gợi ý lý tưởng chuyên sâu');
  
  // Card 3: Lên kế hoạch chuyến đi
  assert.ok(content.includes('Lên kế hoạch chuyến đi'), 'Must have Card 3: Lên kế hoạch chuyến đi');
  
  // Card 4: Diễn đàn & Gói Must-Try
  assert.ok(content.includes('Diễn đàn & Gói Must-Try'), 'Must have Card 4: Diễn đàn & Gói Must-Try');
  
  // Must-Try packages
  assert.ok(content.includes('MUST_TRY_PACKAGES'), 'Must contain curated packages list');
  
  // Floating Ask Chatbot input bar
  assert.ok(content.includes('Hỏi GreenTrip AI...'), 'Must contain placeholder Hỏi GreenTrip AI...');
  assert.ok(content.includes('SUGGESTED_PROMPTS'), 'Must have prompt suggestions for user when undecided');
  
  // Onboarding Modal integration
  assert.ok(content.includes('<OnboardingModal'), 'Must integrate OnboardingModal');
});
