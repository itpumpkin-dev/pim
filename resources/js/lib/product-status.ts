import type { FioriTone } from '@/lib/fiori-style';

/**
 * สถานะสินค้าใน PIM (products.status) — ต้องตรงกับ Product::STATUSES ฝั่ง
 * backend แยกจาก `enabled` ที่คุมหน้าร้าน/Marketplace
 */
export type ProductStatus = 'active' | 'hold' | 'delete' | 'new';

export const PRODUCT_STATUSES: ProductStatus[] = ['active', 'hold', 'delete', 'new'];

/** key ใน namespace `catalog` */
export const PRODUCT_STATUS_LABEL_KEYS: Record<ProductStatus, string> = {
    active: 'productStatusActive',
    hold: 'productStatusHold',
    delete: 'productStatusDelete',
    new: 'productStatusNew',
};

export const PRODUCT_STATUS_TONES: Record<ProductStatus, FioriTone> = {
    active: 'success',
    hold: 'warning',
    delete: 'error',
    new: 'information',
};

export function isProductStatus(value: unknown): value is ProductStatus {
    return typeof value === 'string' && (PRODUCT_STATUSES as string[]).includes(value);
}
