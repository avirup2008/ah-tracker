import { expect, test } from '@playwright/test'

test.describe('app smoke', () => {
  test('analysis API returns data and page renders without error state', async ({ page, request }) => {
    const response = await request.get('/api/analysis?feature=all&period=month')
    expect(response.ok()).toBeTruthy()

    const payload = await response.json()
    expect(payload).toHaveProperty('anomaly')
    expect(payload).toHaveProperty('inflation')

    await page.goto('/analysis')
    await page.waitForResponse((res) =>
      res.url().includes('/api/analysis?feature=all&period=month') && res.ok()
    )

    await expect(page.getByText('Analysis failed to load')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '📊 Overview' })).toBeVisible()
    await expect(page.getByText('Overview').first()).toBeVisible()
  })

  test('receipts API returns data and page renders primary controls', async ({ page, request }) => {
    const response = await request.get('/api/receipts?limit=200')
    expect(response.ok()).toBeTruthy()

    const payload = await response.json()
    expect(payload).toHaveProperty('receipts')
    expect(Array.isArray(payload.receipts)).toBeTruthy()

    await page.goto('/receipts')

    await expect(page.getByText(/All Receipts \(\d+\)/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Parse All Pending' })).toBeVisible()
    await expect(page.getByText('Receipt Review')).toBeVisible()
  })
})
