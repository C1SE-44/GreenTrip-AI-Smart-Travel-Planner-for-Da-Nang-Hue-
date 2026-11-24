import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

test('ChatAttachmentMenu implements 2 core views (file upload + link), staging, drag/paste & split map', async () => {
  const [menuSrc, utilsSrc, ideationSrc, overviewSrc, copilotSvcSrc] = await Promise.all([
    fs.readFile(path.join(frontendRoot, 'src/components/planner/ChatAttachmentMenu.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/chatAttachmentUtils.ts'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/IdeationChatView.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/TripOverviewView.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/services/copilotService.ts'), 'utf8'),
  ]);

  // 1. Popover Menu 2 rows (Upload file & Add link) & validation
  assert.ok(menuSrc.includes('Tải ảnh hoặc tệp lên'), 'Must include Upload a file row');
  assert.ok(menuSrc.includes('ảnh chụp màn hình'), 'Must include interactive screenshot preview trigger');
  assert.ok(menuSrc.includes('border-dotted'), 'Screenshot trigger must use dotted underline');
  assert.ok(menuSrc.includes('Thêm đường dẫn'), 'Must include Add a link row & sub-view');
  assert.ok(menuSrc.includes('YouTube, TikTok, Instagram, Facebook, Pinterest'), 'Must match social link placeholder');
  assert.ok(!menuSrc.includes('Thêm vé / Hóa đơn'), 'Receipt menu option must be removed');
  assert.ok(utilsSrc.includes('MAX_ATTACHMENT_BYTES'), 'Must enforce file size guard');
  assert.ok(utilsSrc.includes('127\\.') && utilsSrc.includes('localhost'), 'Must block loopback/private hosts in normalizeUrlInput');
  assert.ok(menuSrc.includes('StagedAttachmentChip'), 'Must export shared StagedAttachmentChip');
  assert.ok(menuSrc.includes('AttachmentThumbnail') && menuSrc.includes('onError='), 'Must fall back cleanly when thumbnail 404s');

  // 2. YouTube thumbnail extraction for staged & sent previews
  assert.ok(utilsSrc.includes('extractYouTubeVideoId'), 'chatAttachmentUtils must extract YouTube video ID');
  assert.ok(menuSrc.includes('i.ytimg.com/vi/'), 'ChatAttachmentMenu must build YouTube thumbnail preview URL');

  // 3. API payload support
  assert.ok(copilotSvcSrc.includes('CopilotAttachmentPayload'), 'copilotService must export CopilotAttachmentPayload');
  assert.ok(copilotSvcSrc.includes('CopilotExtractedPlace'), 'copilotService must export CopilotExtractedPlace');
  assert.ok(copilotSvcSrc.includes('CopilotReceiptBooking'), 'copilotService must export CopilotReceiptBooking');
  assert.ok(copilotSvcSrc.includes('attachment?: CopilotAttachmentPayload'), 'CopilotChatRequest must accept attachment');

  // 4. Wired into both /chat and /planner with staged preview chip, receipt card, paste/drop & split map
  assert.ok(ideationSrc.includes('<ChatAttachmentMenu'), 'IdeationChatView (/chat) must render ChatAttachmentMenu');
  assert.ok(ideationSrc.includes('StagedAttachmentChip'), 'IdeationChatView must stage attachments using StagedAttachmentChip');
  assert.ok(ideationSrc.includes('onPaste='), 'IdeationChatView must support pasting images directly');
  assert.ok(ideationSrc.includes('receipt-booking-card'), 'IdeationChatView must render receipt booking card');
  assert.ok(ideationSrc.includes('isSplitMapCollapsed'), 'IdeationChatView must support split-screen live map');

  assert.ok(overviewSrc.includes('<ChatAttachmentMenu'), 'TripOverviewView (/planner) must render ChatAttachmentMenu');
  assert.ok(overviewSrc.includes('StagedAttachmentChip'), 'TripOverviewView must stage attachments using StagedAttachmentChip');
  assert.ok(overviewSrc.includes('receipt-booking-card'), 'TripOverviewView must render receipt booking card');
  assert.ok(overviewSrc.includes('onPaste='), 'TripOverviewView must support pasting images directly');
});
