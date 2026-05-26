import { Router } from 'express';
import { fetchAllLatestVersions, fetchLatestVersion } from '../services/version-fetcher';
import { compareVersions } from '../services/comparator';
import { sendNotifications, type UpdateNotification } from '../services/notifier';
import { getAllProducts } from '../services/products';
import { getAllDevicesByProduct } from '../services/customers';

const router = Router();

router.post('/check', async (req, res) => {
  try {
    const { product } = req.body as { product?: string };

    console.log(`[Check] Manual check triggered${product ? ` for ${product}` : ' for all products'}`);

    // Fetch versions
    const versions = product
      ? [await fetchLatestVersion(product)]
      : await fetchAllLatestVersions();

    // Get all devices grouped by product
    const devicesByProduct = getAllDevicesByProduct();

    const updates: UpdateNotification[] = [];

    for (const versionInfo of versions) {
      if (!versionInfo.latestVersion) continue;

      const devices = devicesByProduct[versionInfo.product] || [];
      for (const device of devices) {
        const comparison = compareVersions(device.currentVersion, versionInfo.latestVersion, versionInfo.product);
        updates.push({
          ...comparison,
          customer: device.customerName,
          device: `${device.source}-device-${device.id}`,
        });
      }
    }

    await sendNotifications(updates);

    res.json({ versions, updates });
  } catch (error) {
    console.error('[Check] Error:', error);
    res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
