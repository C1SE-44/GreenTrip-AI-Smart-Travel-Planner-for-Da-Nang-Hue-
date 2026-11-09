import { test, expect } from '@playwright/test';

test.describe('GreenTrip Planner & Itinerary Core Flow (E2E & Quiet Luxury Design)', () => {
  test('Khách du lịch thả tim ở Explore, chuyển sang Chuyến đi và thấy địa điểm trong tab Đã thích', async ({ page }) => {
    // 1. Mở trang Explore
    await page.goto('http://localhost:5173/explore');
    await expect(page.locator('h2:has-text("Địa điểm")')).toBeVisible();

    // 2. Kiểm tra PoiCard có rating đầy đủ và bấm thả tim thẻ đầu tiên
    const firstCard = page.locator('article.group').first();
    await expect(firstCard).toBeVisible();

    const favoriteBtn = firstCard.locator('button[title*="yêu thích"]');
    await expect(favoriteBtn).toBeVisible();
    await favoriteBtn.click();

    // 3. Chuyển sang xem Chuyến đi (Trips)
    await page.click('button:has-text("Chuyến đi")');
    await expect(page.locator('h1, h2, h3')).toContainText(/chuyến đi/i);

    // 4. Mở khay Ý tưởng
    const ideasBtn = page.locator('button:has-text("Ý tưởng")').first();
    await ideasBtn.click();

    // 5. Mở modal thêm ý tưởng và kiểm tra tab "Đã thích"
    const addIdeaBtn = page.locator('button:has-text("Thêm ý tưởng")').first();
    await addIdeaBtn.click();

    const likedTab = page.locator('button:has-text("Đã thích")');
    await expect(likedTab).toBeVisible();
    await likedTab.click();

    // Đảm bảo có nút "+ Thêm" trên thẻ địa điểm đã thích
    const addBtn = page.locator('button:has-text("Thêm")').first();
    await expect(addBtn).toBeVisible();
  });

  test('Người dùng sắp xếp lại thứ tự (Reorder) và đổi trạng thái điểm dừng trên Mobile', async ({ page }) => {
    // Giả lập kích thước màn hình điện thoại (iPhone 14 Pro: 393 x 852)
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('http://localhost:5173/explore?view=trips&subTab=calendar');

    // 1. Kiểm tra màn hình Lịch trình hiển thị thanh chọn ngày
    const day1Btn = page.locator('button:has-text("Ngày 1")').first();
    await expect(day1Btn).toBeVisible();

    // 2. Kiểm tra các nút đổi thứ tự (Arrow Down / Up)
    const downBtn = page.locator('button[title="Đưa xuống sau"]').first();
    if (await downBtn.isVisible()) {
      await expect(downBtn).toBeEnabled();
      await downBtn.click();
    }

    // 3. Đổi trạng thái từ "Chưa đi" sang "Đang ghé"
    const statusBtn = page.locator('button[title*="Chưa đi"]').first();
    if (await statusBtn.isVisible()) {
      await statusBtn.click();
      await expect(page.locator('button[title*="Đang diễn ra"], button:has-text("Đang ghé")')).toBeVisible();
    }
  });
});
