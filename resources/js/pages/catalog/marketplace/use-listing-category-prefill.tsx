import { FioriMessageStrip } from '@/components/fiori-form';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { ProductMatching } from './matched-listing-cell';

interface PrefillProduct {
    id: number;
    category_mapped: boolean;
    matching: ProductMatching;
}

/**
 * "1. Category Mapping" ของหน้า Map สินค้า — สินค้าที่จับคู่ listing ไว้แล้วแต่ Master Category ยังไม่ได้แมป:
 * ตั้งหมวดหมู่ของ listing บนร้าน (ListingImportController::listingCategory — ใช้ detail ที่แคชไว้ก่อน ไม่มีก็ดึงจาก
 * platform ครั้งเดียว) เป็นค่าเริ่มต้นใน picker. ไม่บันทึกเอง — mapping มีผลกับทุกสินค้าใน Master Category เดียวกัน
 * ผู้ใช้ต้องตรวจแล้วกดบันทึกเอง. ไม่ทับค่าที่มีอยู่แล้ว (deep link ?category= / ผู้ใช้เลือกไปก่อนผลมาถึง).
 *
 * คืน message strip ไว้วางใต้ picker (null เมื่อไม่ได้ตั้งค่าให้)
 */
export function useListingCategoryPrefill(
    platform: 'shopee' | 'lazada' | 'tiktok' | 'woocommerce',
    product: PrefillProduct | null,
    selectedCategoryId: number | null,
    setSelectedCategoryId: Dispatch<SetStateAction<number | null>>,
) {
    const [note, setNote] = useState<{ categoryId: number; shop: string; name: string | null } | null>(null);
    const selectedRef = useRef(selectedCategoryId);
    selectedRef.current = selectedCategoryId;

    const productId = product?.id ?? null;
    const eligible = Boolean(product && !product.category_mapped && product.matching.listings.some((l) => l.direct));

    useEffect(() => {
        setNote(null);
        if (productId === null || !eligible) return;

        let cancelled = false;
        fetch(`/catalog/marketplace/products/${productId}/listing-category/${platform}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { category_id: number | null; category_name: string | null; shop: string | null } | null) => {
                if (cancelled || !body?.category_id || selectedRef.current !== null) return;
                setSelectedCategoryId(body.category_id);
                setNote({ categoryId: body.category_id, shop: body.shop ?? '', name: body.category_name });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened product
    }, [productId, eligible, platform]);

    // ผู้ใช้เปลี่ยนไปเลือกหมวดหมู่อื่นแล้ว → ข้อความนี้ไม่ตรงกับค่าใน picker อีก
    if (!note || note.categoryId !== selectedCategoryId) return null;

    return (
        <FioriMessageStrip severity="information" onClose={() => setNote(null)}>
            ตั้งค่าเริ่มต้นจากหมวดหมู่ของสินค้าที่จับคู่ไว้บนร้าน {note.shop}
            {note.name ? ` (${note.name})` : ''} — ตรวจแล้วกด &quot;บันทึก Category Mapping&quot; (มีผลกับทุกสินค้าใน Master Category นี้)
        </FioriMessageStrip>
    );
}
