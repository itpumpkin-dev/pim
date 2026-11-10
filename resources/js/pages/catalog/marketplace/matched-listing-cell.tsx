import '@ui5/webcomponents-icons/dist/detail-view.js';
import '@ui5/webcomponents-icons/dist/status-positive.js';
import { Button, Icon, Menu, MenuItem } from '@ui5/webcomponents-react';
import { useState } from 'react';

import { Caption } from './marketplace-ui';
import { ProductMatchingDetailDialog, type DetailDialogListing } from './product-matching-detail-dialog';

/** listing ที่ผูก (Product Matching) กับสินค้า — ดู ProductMatchStatus::matchedListingsByProduct() */
export interface MatchedListing extends DetailDialogListing {
    shop: string;
    /** linked to the product itself (not as a bundle component) — importable (ListingImportPanel) */
    direct: boolean;
}

export interface ProductMatching {
    matched: boolean;
    shops: string[];
    listings: MatchedListing[];
}

const listingLabel = (l: MatchedListing) => `${l.shop} · ${l.seller_sku || `Item ${l.item_id}`}`;

/**
 * คอลัมน์ "Matching" ของตาราง "สินค้า (Product Mapping)" (lazada/shopee/tiktok/
 * woocommerce-products.tsx): ✓ จับคู่แล้ว + ปุ่ม "รายละเอียดสินค้าบนแพลตฟอร์ม" —
 * dialog ตัวเดียวกับหน้าจับคู่สินค้า (ProductMatchingDetailDialog) ผูกไว้ listing
 * เดียวเปิดเลย หลาย listing (หลายร้าน) ให้เลือกจากเมนูก่อน
 */
export function MatchedListingCell({
    matching,
    canRefresh,
    canOpenProduct,
}: {
    matching: ProductMatching;
    canRefresh: boolean;
    canOpenProduct: boolean;
}) {
    const [menuOpener, setMenuOpener] = useState<HTMLElement | null>(null);
    const [detailTarget, setDetailTarget] = useState<MatchedListing | null>(null);

    if (!matching.matched) return <Caption>—</Caption>;

    const listings = matching.listings;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem' }}>
            <span style={{ display: 'inline-flex' }} title={`จับคู่แล้ว: ${matching.shops.join(', ')}`}>
                <Icon name="status-positive" accessibleName="จับคู่แล้ว" style={{ width: 20, height: 20, color: 'var(--sapPositiveColor)' }} />
            </span>
            {listings.length > 0 && (
                <Button
                    design="Transparent"
                    icon="detail-view"
                    tooltip={listings.length === 1 ? `รายละเอียดสินค้าบนแพลตฟอร์ม (${listingLabel(listings[0])})` : 'รายละเอียดสินค้าบนแพลตฟอร์ม'}
                    accessibleName="รายละเอียดสินค้าบนแพลตฟอร์ม"
                    onClick={(e) => (listings.length === 1 ? setDetailTarget(listings[0]) : setMenuOpener(e.currentTarget as HTMLElement))}
                />
            )}

            {listings.length > 1 && (
                <Menu
                    open={menuOpener !== null}
                    opener={menuOpener ?? undefined}
                    headerText="รายละเอียดสินค้าบนแพลตฟอร์ม"
                    onClose={() => setMenuOpener(null)}
                    onItemClick={(e) => {
                        const id = Number((e.detail.item as HTMLElement).dataset.id);
                        setMenuOpener(null);
                        setDetailTarget(listings.find((l) => l.id === id) ?? null);
                    }}
                >
                    {listings.map((l) => (
                        <MenuItem key={l.id} data-id={l.id} icon="detail-view" text={listingLabel(l)} />
                    ))}
                </Menu>
            )}

            {detailTarget && (
                <ProductMatchingDetailDialog
                    listing={detailTarget}
                    pageUrl="/catalog/marketplace/product-matching"
                    canRefresh={canRefresh}
                    canOpenProduct={canOpenProduct}
                    onClose={() => setDetailTarget(null)}
                />
            )}
        </span>
    );
}
