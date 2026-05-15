import { Router } from 'express';
import { getAllProducts, getLatestVersion } from '../services/products';
import { compareVersions, type ComparisonResult } from '../services/comparator';
import { getAllDevicesByProduct } from '../services/customers';

const router = Router();

export interface ProductStatus {
  product: string;
  productName: string;
  latestVersion: string;
  releaseUrl: string;
  checkedAt: string;
  error?: string;
  customers: Array<{
    id: number;
    name: string;
    devices: Array<{
      id: number;
      name: string;
      currentVersion: string;
      latestVersion?: string;
      status: ComparisonResult['status'];
    }>;
  }>;
}

router.get('/products', async (_req, res) => {
  try {
    const products = getAllProducts();
    const devicesByProduct = getAllDevicesByProduct();

    const result: ProductStatus[] = products.map(product => {
      const latest = getLatestVersion(product.id);
      const latestVersion = latest?.version || '';

      // Group devices by customer
      const productDevices = devicesByProduct[product.id] || [];
      const customerMap = new Map<number, { id: number; name: string; devices: any[] }>();

      for (const device of productDevices) {
        if (!customerMap.has(device.customerId)) {
          customerMap.set(device.customerId, {
            id: device.customerId,
            name: device.customerName,
            devices: [],
          });
        }

        const comparison = latestVersion
          ? compareVersions(device.currentVersion, latestVersion, product.id)
          : { status: 'unknown' as const };

        customerMap.get(device.customerId)!.devices.push({
          id: device.id,
          name: device.deviceName || device.customerName,
          currentVersion: device.currentVersion,
          latestVersion: latestVersion || undefined,
          status: comparison.status,
        });
      }

      return {
        product: product.id,
        productName: product.name,
        latestVersion,
        releaseUrl: latest?.releaseUrl || '',
        checkedAt: latest?.checkedAt || '',
        customers: Array.from(customerMap.values()),
      };
    });

    res.json(result);
  } catch (error) {
    console.error('[API] Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

export default router;
