import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const homeViewPath = path.resolve('src/components/home/HomeDashboardView.tsx');
const tripPackagesPath = path.resolve('src/components/home/TripPackagesSection.tsx');
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

test('Home View: HomeDashboardView renders four action cards and curated packages', () => {
  const content = fs.readFileSync(homeViewPath, 'utf8');
  
  // Card 1: Hoàn tất thiết lập trợ lý
  assert.ok(content.includes('Hoàn tất thiết lập trợ lý'), 'Must have Card 1: Hoàn tất thiết lập trợ lý');
  assert.ok(content.includes('setIsOnboardingOpen(true)'), 'Card 1 must open OnboardingModal');
  
  // Card 2: Gợi ý lý tưởng chuyên sâu
  assert.ok(content.includes('Gợi ý lý tưởng chuyên sâu'), 'Must have Card 2: Gợi ý lý tưởng chuyên sâu');
  
  // Card 3: Lên kế hoạch chuyến đi
  assert.ok(content.includes('Lên kế hoạch chuyến đi'), 'Must have Card 3: Lên kế hoạch chuyến đi');
  
  // Card 4 links to the current curated trip package section.
  assert.ok(content.includes('Gói hành trình tuyển chọn'), 'Must have the curated packages card');
  assert.ok(content.includes('MUST TRY'), 'Must label the curated packages card');
  assert.ok(content.includes('<TripPackagesSection'), 'Must render the curated packages section');
  const packagesContent = fs.readFileSync(tripPackagesPath, 'utf8');
  assert.ok(packagesContent.includes('id="trip-packages"'), 'Must render the section targeted by the card');
  assert.ok(packagesContent.includes('resolveTripPackages'), 'Must resolve curated packages from the POI catalog');
  
  // Floating Ask Chatbot input bar
  assert.ok(content.includes('Hỏi GreenTrip AI...'), 'Must contain placeholder Hỏi GreenTrip AI...');
  assert.ok(content.includes('SUGGESTED_PROMPTS'), 'Must have prompt suggestions for user when undecided');
  
  // Onboarding Modal integration
  assert.ok(content.includes('<OnboardingModal'), 'Must integrate OnboardingModal');
});
