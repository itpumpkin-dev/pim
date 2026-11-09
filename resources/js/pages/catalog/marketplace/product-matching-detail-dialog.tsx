import { FioriMessageStrip } from '@/components/fiori-form';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { xsrfToken } from '@/lib/csrf';
import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action.js';
import '@ui5/webcomponents-icons/dist/picture.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import { Bar, BusyIndicator, Button, Dialog, Icon, Link, Tag, Title } from '@ui5/webcomponents-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Body, Caption, HStack, TONE_TEXT, useMediaQuery } from './marketplace-ui';
import styles from './product-matching-detail-dialog.module.css';

interface DetailAttribute {
    id: string | null;
    name: string;
    values: string[];
}

interface DetailVariant {
    variant_id: string;
    seller_sku: string | null;
    name: string | null;
    options: Record<string, string>;
    price: number | null;
    special_price: number | null;
    quantity: number | null;
    status: string | null;
    image: string | null;
}

interface DetailPackage {
    weight_kg: number | null;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
}

interface PimProduct {
    id: number;
    sku: string;
    name: string | null;
    price: number | null;
    brand: string | null;
    image_url: string | null;
    quantity: number;
}

export interface ListingDetailResponse {
    listing: {
        id: number;
        item_id: string;
        variant_id: string;
        seller_sku: string | null;
        name: string | null;
        url: string | null;
        platform: string;
        platform_label: string;
        shop: { id: number; name: string };
    };
    detail: {
        has_data: boolean;
        is_stale: boolean;
        name: string | null;
        description_text: string | null;
        brand_id: string | null;
        brand_name: string | null;
        category_id: string | null;
        category_name: string | null;
        images: string[];
        video_url: string | null;
        attributes: DetailAttribute[];
        package: DetailPackage | null;
        variants: DetailVariant[];
        status: string | null;
        listing_url: string | null;
        fetched_at: string | null;
        fetch_error: string | null;
        fetch_duration_ms: number | null;
    };
    pim: { type: 'single' | 'bundle'; pack_quantity: number | null; products: PimProduct[] } | null;
}

/** what the dialog needs to know about the row it was opened from (shown while loading) */
export interface DetailDialogListing {
    id: number;
    item_id: string;
    seller_sku: string | null;
    name: string | null;
}

const ACTIVE_STATUSES = ['active', 'normal', 'activate', 'publish', 'model_normal'];
const statusDesign = (status: string | null) => {
    if (!status) return 'Neutral';
    const s = status.toLowerCase();
    if (ACTIVE_STATUSES.includes(s)) return 'Positive';
    if (['banned', 'deleted', 'freeze', 'failed', 'seller_deactivated', 'platform_deactivated'].includes(s)) return 'Negative';
    return 'Critical';
};

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const formatPrice = (value: number | null) =>
    value === null ? '—' : `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const formatNum = (value: number | null, unit: string) =>
    value === null ? null : `${value.toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${unit}`;

function packageText(pkg: DetailPackage | null) {
    if (!pkg) return { weight: null, size: null };
    const dims = [pkg.length_cm, pkg.width_cm, pkg.height_cm];
    const size = dims.some((d) => d !== null)
        ? `${dims.map((d) => (d === null ? '?' : d.toLocaleString('th-TH', { maximumFractionDigits: 2 }))).join(' × ')} ซม. (ย×ก×ส)`
        : null;
    return { weight: formatNum(pkg.weight_kg, 'กก.'), size };
}

async function readError(res: Response) {
    if (res.status === 403) return 'คุณไม่มีสิทธิ์ดูหรือดึงข้อมูลของร้านนี้';
    if (res.status === 419) return 'เซสชันหมดอายุ — รีเฟรชหน้าแล้วลองใหม่';
    try {
        const body = await res.json();
        if (body?.message) return String(body.message);
    } catch {
        // not JSON
    }
    return `โหลดข้อมูลไม่สำเร็จ (HTTP ${res.status})`;
}

/**
 * "รายละเอียด" dialog of the Product Matching page: the listing item's full
 * marketplace detail (ProductMatchingDetailController — fetched read-only on
 * demand into marketplace_listing_details, then served from there until the
 * TTL runs out), side by side with the linked PIM product(s). The
 * description is shown as plain text only (description_text) — marketplace
 * HTML is never rendered.
 */
export function ProductMatchingDetailDialog({
    listing,
    pageUrl,
    canRefresh,
    canOpenProduct,
    onClose,
}: {
    listing: DetailDialogListing | null;
    pageUrl: string;
    canRefresh: boolean;
    canOpenProduct: boolean;
    onClose: () => void;
}) {
    const isNarrow = useMediaQuery('(max-width: 599px)');
    const [data, setData] = useState<ListingDetailResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controller = useRef<AbortController | null>(null);

    const load = useCallback(
        (id: number, refresh: boolean) => {
            controller.current?.abort();
            const ctrl = new AbortController();
            controller.current = ctrl;
            setError(null);
            if (refresh) setRefreshing(true);
            else setLoading(true);

            const url = `${pageUrl}/listings/${id}/detail${refresh ? '/refresh' : ''}`;
            fetch(url, {
                method: refresh ? 'POST' : 'GET',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(refresh ? { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrfToken() } : {}),
                },
                signal: ctrl.signal,
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error(await readError(res));
                    return res.json() as Promise<ListingDetailResponse>;
                })
                .then((body) => setData(body))
                .catch((e: unknown) => {
                    if (e instanceof DOMException && e.name === 'AbortError') return;
                    setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
                })
                .finally(() => {
                    if (controller.current === ctrl) {
                        setLoading(false);
                        setRefreshing(false);
                    }
                });
        },
        [pageUrl],
    );

    useEffect(() => {
        if (!listing) {
            controller.current?.abort();
            return;
        }
        setData(null);
        load(listing.id, false);
    }, [listing, load]);

    useEffect(() => () => controller.current?.abort(), []);

    const detail = data?.detail ?? null;
    const title = detail?.name || data?.listing.name || listing?.name || listing?.seller_sku || (listing ? `Item ${listing.item_id}` : '');
    const listingUrl = detail?.listing_url ?? data?.listing.url ?? null;
    const pkg = packageText(detail?.package ?? null);
    const busy = loading || refreshing;

    const facts: [string, string | null][] = detail
        ? [
              ['แบรนด์', detail.brand_name],
              ['หมวดหมู่', detail.category_name ?? (detail.category_id ? `ID ${detail.category_id}` : null)],
              ['น้ำหนักพัสดุ', pkg.weight],
              ['ขนาดพัสดุ', pkg.size],
          ]
        : [];

    const header = (
        <div className={styles.header}>
            <Title level="H5" size="H5" wrappingType="Normal">
                {title}
            </Title>
            <div className={styles.headerMeta}>
                {data && (
                    <Caption>
                        {data.listing.platform_label} · {data.listing.shop.name}
                    </Caption>
                )}
                {detail?.status && (
                    <Tag design={statusDesign(detail.status)} hideStateIcon>
                        {detail.status}
                    </Tag>
                )}
                <Caption mono>Item {data?.listing.item_id ?? listing?.item_id}</Caption>
                {listingUrl && (
                    <Link href={listingUrl} target="_blank" icon="action">
                        เปิดบน {data?.listing.platform_label ?? 'แพลตฟอร์ม'}
                    </Link>
                )}
            </div>
            {detail && (
                <div className={styles.headerMeta}>
                    <Caption>
                        ดึงข้อมูลเมื่อ {formatDateTime(detail.fetched_at)}
                        {detail.is_stale ? ' (ข้อมูลเก่า)' : ''}
                    </Caption>
                    {canRefresh && listing && (
                        <Button
                            design="Transparent"
                            icon="refresh"
                            disabled={busy}
                            loading={refreshing}
                            loadingDelay={0}
                            tooltip="ดึงข้อมูลล่าสุดจากแพลตฟอร์ม (อ่านอย่างเดียว)"
                            onClick={() => load(listing.id, true)}
                        >
                            ดึงใหม่
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    const pimPanel = data?.pim ? (
        <aside className={styles.pimPanel} aria-label="สินค้าใน PIM">
            <div className={styles.sectionTitle}>
                สินค้าใน PIM
                {data.pim.type === 'bundle' ? ` (ชุดรวม ${data.pim.products.length} รายการ)` : ''}
                {data.pim.type === 'single' && data.pim.pack_quantity && data.pim.pack_quantity > 1 ? ` (แพ็ก ×${data.pim.pack_quantity})` : ''}
            </div>
            {data.pim.products.map((p) => (
                <div key={p.id} className={styles.pimProduct}>
                    <ClickableThumbnail
                        src={p.image_url}
                        alt={p.sku}
                        size={56}
                        fallback={<Icon name="picture" style={{ color: 'var(--sapContent_IconColor)' }} />}
                    />
                    <div className={styles.pimText}>
                        <HStack gap="0.375rem">
                            {canOpenProduct ? (
                                <Link
                                    href={`/catalog/products/${p.id}/edit`}
                                    style={{ fontWeight: 600 }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        router.visit(`/catalog/products/${p.id}/edit`);
                                    }}
                                >
                                    {p.sku}
                                </Link>
                            ) : (
                                <Body style={{ fontWeight: 600 }}>{p.sku}</Body>
                            )}
                            {data.pim?.type === 'bundle' && <Body style={{ fontWeight: 600 }}>×{p.quantity}</Body>}
                        </HStack>
                        {p.name && <Body>{p.name}</Body>}
                        <Caption>
                            ราคา {formatPrice(p.price)} · แบรนด์ {p.brand ?? '—'}
                        </Caption>
                    </div>
                </div>
            ))}
        </aside>
    ) : null;

    let content;
    if (!data && loading) {
        content = (
            <div className={styles.centered}>
                <BusyIndicator active delay={0} size="M" />
                <Caption>กำลังโหลดรายละเอียด — ครั้งแรกจะดึงจากแพลตฟอร์ม อาจใช้เวลาสักครู่</Caption>
            </div>
        );
    } else if (!data && error) {
        content = (
            <div className={styles.body}>
                <FioriMessageStrip severity="error">{error}</FioriMessageStrip>
                {listing && (
                    <div>
                        <Button design="Default" icon="refresh" onClick={() => load(listing.id, false)}>
                            ลองใหม่
                        </Button>
                    </div>
                )}
            </div>
        );
    } else if (data && detail) {
        content = (
            <div className={styles.body}>
                {error && <FioriMessageStrip severity="error">{error}</FioriMessageStrip>}
                {detail.fetch_error && !detail.has_data && (
                    <FioriMessageStrip severity="error">ดึงรายละเอียดจากแพลตฟอร์มไม่สำเร็จ: {detail.fetch_error}</FioriMessageStrip>
                )}
                {detail.fetch_error && detail.has_data && (
                    <FioriMessageStrip severity="warning">
                        ดึงข้อมูลล่าสุดไม่สำเร็จ — แสดงข้อมูลเดิมเมื่อ {formatDateTime(detail.fetched_at)}: {detail.fetch_error}
                    </FioriMessageStrip>
                )}
                {!detail.has_data && listing && (
                    <div>
                        <Button
                            design="Default"
                            icon="refresh"
                            disabled={busy}
                            loading={busy}
                            loadingDelay={0}
                            onClick={() => load(listing.id, true)}
                        >
                            ลองใหม่
                        </Button>
                    </div>
                )}

                {detail.has_data && (
                    <div className={`${styles.layout} ${pimPanel ? styles.layoutWithPim : ''}`}>
                        <div className={styles.main}>
                            <section className={styles.section}>
                                <div className={styles.sectionTitle}>รูปภาพ ({detail.images.length})</div>
                                {detail.images.length === 0 ? (
                                    <Caption>— ไม่มีรูป —</Caption>
                                ) : (
                                    <div className={styles.gallery}>
                                        {detail.images.map((src, i) => (
                                            <ClickableThumbnail key={src} src={src} alt={`${title} — รูปที่ ${i + 1}`} size={isNarrow ? 64 : 80} />
                                        ))}
                                    </div>
                                )}
                                {detail.video_url && (
                                    <Link href={detail.video_url} target="_blank" icon="action">
                                        เปิดวิดีโอ
                                    </Link>
                                )}
                            </section>

                            <section className={styles.section}>
                                <div className={styles.sectionTitle}>ข้อมูลหลัก</div>
                                <dl className={styles.facts}>
                                    {facts.map(([label, value]) => (
                                        <div key={label} style={{ display: 'contents' }}>
                                            <dt>{label}</dt>
                                            <dd>{value ?? '—'}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>

                            <section className={styles.section}>
                                <div className={styles.sectionTitle}>รายละเอียดสินค้า</div>
                                {detail.description_text ? (
                                    <div className={styles.description}>{detail.description_text}</div>
                                ) : (
                                    <Caption>— ไม่มีคำอธิบายแบบข้อความ (อาจเป็นรูปภาพล้วน) —</Caption>
                                )}
                            </section>

                            {detail.attributes.length > 0 && (
                                <section className={styles.section}>
                                    <div className={styles.sectionTitle}>คุณสมบัติ ({detail.attributes.length})</div>
                                    <div className={styles.tableWrap}>
                                        <table className={styles.table}>
                                            <tbody>
                                                {detail.attributes.map((a, i) => (
                                                    <tr key={`${a.id ?? a.name}-${i}`}>
                                                        <th scope="row">{a.name}</th>
                                                        <td>{a.values.join(', ')}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            )}

                            <section className={styles.section}>
                                <div className={styles.sectionTitle}>ตัวเลือกสินค้า / SKU ({detail.variants.length})</div>
                                {detail.variants.length === 0 ? (
                                    <Caption>— ไม่มีข้อมูล SKU —</Caption>
                                ) : (
                                    <div className={styles.tableWrap}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>Seller SKU</th>
                                                    <th>ตัวเลือก</th>
                                                    <th className={styles.num}>ราคา</th>
                                                    <th className={styles.num}>คงเหลือ</th>
                                                    <th>สถานะ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.variants.map((v, i) => {
                                                    const current = v.variant_id === data.listing.variant_id;
                                                    const options = Object.entries(v.options ?? {});
                                                    return (
                                                        <tr
                                                            key={`${v.variant_id}-${i}`}
                                                            className={current ? styles.currentRow : undefined}
                                                            title={current ? 'listing แถวที่เปิดอยู่' : undefined}
                                                        >
                                                            <td className={styles.mono}>{v.seller_sku ?? '—'}</td>
                                                            <td>
                                                                {options.length > 0 ? options.map(([k, val]) => `${k}: ${val}`).join(' · ') : '—'}
                                                            </td>
                                                            <td className={styles.num}>
                                                                {v.special_price !== null ? (
                                                                    <>
                                                                        <span style={{ color: TONE_TEXT.error, fontWeight: 600 }}>
                                                                            {formatPrice(v.special_price)}
                                                                        </span>
                                                                        <span className={styles.strike}>{formatPrice(v.price)}</span>
                                                                    </>
                                                                ) : (
                                                                    formatPrice(v.price)
                                                                )}
                                                            </td>
                                                            <td className={styles.num}>{v.quantity ?? '—'}</td>
                                                            <td>{v.status ?? '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </div>
                        {pimPanel}
                    </div>
                )}
            </div>
        );
    }

    return (
        <ImagePreviewProvider>
            <Dialog
                open={listing !== null}
                onClose={onClose}
                stretch={isNarrow}
                style={isNarrow ? undefined : { width: 'min(1040px, calc(100vw - 2rem))' }}
                accessibleName="รายละเอียดสินค้าบนแพลตฟอร์ม"
                header={header}
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <Button design="Transparent" onClick={onClose}>
                                ปิด
                            </Button>
                        }
                    />
                }
            >
                {content}
            </Dialog>
        </ImagePreviewProvider>
    );
}
