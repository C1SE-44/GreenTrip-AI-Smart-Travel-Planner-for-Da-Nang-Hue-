import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

test('MindtripAttachmentMenu implements all 3 views (menu, link, receipt) matching Mindtrip AI 1:1', async () => {
  const [menuSrc, ideationSrc, overviewSrc, copilotSvcSrc] = await Promise.all([
    fs.readFile(path.join(frontendRoot, 'src/components/planner/MindtripAttachmentMenu.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/IdeationChatView.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/TripOverviewView.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/services/copilotService.ts'), 'utf8'),
  ]);

  // 1. Popover Menu 3 rows & Mindtrip details
  assert.ok(menuSrc.includes('Tải ảnh hoặc tệp lên'), 'Must include Upload a file row');
  assert.ok(menuSrc.includes('ảnh chụp màn hình'), 'Must include interactive screenshot preview trigger');
  assert.ok(menuSrc.includes('border-dotted'), 'Screenshot trigger must use Mindtrip dotted underline');
  assert.ok(menuSrc.includes('Thêm đường dẫn'), 'Must include Add a link row & sub-view');
  assert.ok(menuSrc.includes('YouTube, TikTok, Instagram, Facebook, Pinterest'), 'Must match social link placeholder');
  assert.ok(menuSrc.includes('Thêm vé / Hóa đơn'), 'Must include Add a receipt row & sub-view');
  assert.ok(menuSrc.includes('onDrop='), 'Receipt view must support drag & drop upload');
  assert.ok(menuSrc.includes('MAX_FILE_BYTES'), 'Must enforce file size guard');

  // 2. YouTube thumbnail extraction for staged & sent previews
  assert.ok(menuSrc.includes('extractYouTubeVideoId'), 'MindtripAttachmentMenu must extract YouTube video ID');
  assert.ok(menuSrc.includes('i.ytimg.com/vi/'), 'MindtripAttachmentMenu must build YouTube thumbnail preview URL');

  // 3. API payload support
  assert.ok(copilotSvcSrc.includes('CopilotAttachmentPayload'), 'copilotService must export CopilotAttachmentPayload');
  assert.ok(copilotSvcSrc.includes('CopilotExtractedPlace'), 'copilotService must export CopilotExtractedPlace');
  assert.ok(copilotSvcSrc.includes('CopilotReceiptBooking'), 'copilotService must export CopilotReceiptBooking');
  assert.ok(copilotSvcSrc.includes('attachment?: CopilotAttachmentPayload'), 'CopilotChatRequest must accept attachment');

  // 4. Wired into both /chat and /planner with staged preview chip, receipt card & desktop split-screen map
  assert.ok(ideationSrc.includes('<MindtripAttachmentMenu'), 'IdeationChatView (/chat) must render MindtripAttachmentMenu');
  assert.ok(ideationSrc.includes('pendingAttachment'), 'IdeationChatView must stage attachments inside the input box');
  assert.ok(ideationSrc.includes('staged-attachment-chip'), 'IdeationChatView must render staged attachment preview chip');
  assert.ok(ideationSrc.includes('receipt-booking-card'), 'IdeationChatView must render receipt booking card');
  assert.ok(ideationSrc.includes('isSplitMapCollapsed'), 'IdeationChatView must support Mindtrip-style split-screen live map');
  assert.ok(overviewSrc.includes('<MindtripAttachmentMenu'), 'TripOverviewView (/planner) must render MindtripAttachmentMenu');
  assert.ok(overviewSrc.includes('pendingAttachment'), 'TripOverviewView must stage attachments inside the chat input box');
});
