import { MarketplacePushReview, isReviewablePlatform, type ReviewablePlatform } from '@/components/catalog/marketplace-push-review';
import { FioriFormGroup, FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/upload-to-cloud.js';
import { Button, CheckBox, Link, ObjectStatus, Text, Toolbar, ToolbarSpacer } from '@ui5/webcomponents-react';
import { useCallback, useEffect, useState } from 'react';

import type { EditPlatform } from './platform-edit-panel';

interface SyncJob {
    id: number;
    shop: string | null;
    action: 'push' | 'deactivate' | 'delete' | string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | string;
    message: string | null;
    created_at: string | null;
}

interface ShopRow {
    id: number;
    name: string;
    published: boolean;
    is_live: boolean;
    live_synced_at: string | null;
    platform_item_id: string | null;
    known: boolean;
    last_job: SyncJob | null;
}

interface PushStatus {
    product: { enabled: boolean; status: string | null; status_allows_publish: boolean };
    can_push: boolean;
    can_toggle: boolean;
    shops: ShopRow[];
    history: SyncJob[];
}

/** per-shop write endpoints on ProductController (queueMarketplaceSync() & co.) */
const ROUTES: Record<EditPlatform, { push: string; deactivate: string; status: string; delete?: string }> = {
    lazada: { push: 'push-lazada', deactivate: 'deactivate-lazada', status: 'lazada-status' },
    shopee: { push: 'push-shopee', deactivate: 'deactivate-shopee', status: 'shopee-status', delete: 'delete-shopee' },
    tiktok: { push: 'push-tiktok', deactivate: 'deactivate-tiktok', status: 'tiktok-status' },
    woocommerce: { push: 'push-woocommerce', deactivate: 'deactivate-woocommerce', status: 'woocommerce-status' },
};

const ACTION_LABEL: Record<string, string> = { push: 'Push', deactivate: 'ปิดการขาย', delete: 'ลบ listing' };
const JOB_STATE: Record<string, { label: string; state: 'Positive' | 'Negative' | 'Information' | 'None' }> = {
    completed: { label: 'สำเร็จ', state: 'Positive' },
    failed: { label: 'ไม่สำเร็จ', state: 'Negative' },
    processing: { label: 'กำลังทำงาน', state: 'Information' },
    queued: { label: 'รอคิว', state: 'Information' },
};
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 90;

const xsrfToken = () =>
    decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '');

/**
 * Step "Push ไป {platform}" ของหน้า Map สินค้า — ที่เดียวที่ส่งข้อมูลขึ้น marketplace ได้
 * (Push / ปิดการขาย / ลบ listing / เช็คสถานะ) ทีละร้าน: ติ๊กเผยแพร่ → ตรวจความพร้อม
 * (MarketplacePushReview) → Push (ถ้ายังไม่ผ่าน Product Matching ต้องยืนยัน "สร้างเป็น
 * สินค้าใหม่") → ติดตามผลจาก sync job — ดู PlatformPushController
 */
export function PlatformPushPanel({
    active,
    productId,
    platform,
    platformLabel,
}: {
    active: boolean;
    productId: number;
    platform: EditPlatform;
    platformLabel: string;
}) {
    const [data, setData] = useState<PushStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyShop, setBusyShop] = useState<number | null>(null);
    const [message, setMessage] = useState<{ severity: 'success' | 'error' | 'information'; text: string } | null>(null);
    const [reviewReady, setReviewReady] = useState(!isReviewablePlatform(platform));
    const [activated, setActivated] = useState(active);
    const { confirm, confirmElement } = useFioriConfirm();
    const routes = ROUTES[platform];

    useEffect(() => {
        if (active) setActivated(true);
    }, [active]);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/catalog/marketplace/products/${productId}/push/${platform}`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || 'โหลดสถานะไม่สำเร็จ');
                setData(body as PushStatus);
            })
            .catch((e: Error) => setMessage({ severity: 'error', text: e.message }))
            .finally(() => setLoading(false));
    }, [productId, platform]);

    useEffect(() => {
        if (activated) load();
    }, [activated, load]);

    const pollJob = (jobId: number, shopName: string, action: string) => {
        let attempts = 0;
        const poll = () => {
            attempts++;
            fetch(`/catalog/products/${productId}/sync-jobs/${jobId}`, { headers: { Accept: 'application/json' } })
                .then(async (res) => {
                    const body = await res.json();
                    if (!res.ok || body.status === 'failed') {
                        setMessage({ severity: 'error', text: `${ACTION_LABEL[action] ?? action} ${shopName} ไม่สำเร็จ: ${body.message ?? ''}` });
                    } else if (body.status === 'completed') {
                        setMessage({ severity: 'success', text: body.message || `${ACTION_LABEL[action] ?? action} ${shopName} สำเร็จ` });
                    } else if (attempts < POLL_MAX_ATTEMPTS) {
                        window.setTimeout(poll, POLL_INTERVAL_MS);
                        return;
                    } else {
                        setMessage({
                            severity: 'information',
                            text: `${ACTION_LABEL[action] ?? action} ${shopName} ยังทำงานอยู่ — ดูผลได้ในประวัติด้านล่างภายหลัง`,
                        });
                    }
                    setBusyShop(null);
                    load();
                })
                .catch(() => {
                    setBusyShop(null);
                    load();
                });
        };
        poll();
    };

    /** POST one per-shop action; push handles the Product Matching 409 (confirm → resend) */
    const send = (shop: ShopRow, action: 'push' | 'deactivate' | 'delete', confirmNewListing = false) => {
        const segment = routes[action];
        if (!segment) return;
        setBusyShop(shop.id);
        setMessage(null);
        fetch(`/catalog/products/${productId}/${segment}/${shop.id}`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(confirmNewListing ? { confirm_new_listing: true } : {}),
        })
            .then(async (res) => {
                const body = await res.json();
                if (res.status === 409 && body.code === 'not_matched') {
                    setBusyShop(null);
                    const ok = await confirm({
                        title: 'สินค้านี้ยังไม่ได้จับคู่',
                        message: `${body.message} — ยืนยันว่าเป็นสินค้าใหม่ที่ยังไม่เคยวางขายบน ${shop.name}? (ถ้ามี listing อยู่แล้ว ให้จับคู่ที่หน้า "จับคู่สินค้า" ก่อน)`,
                        confirmLabel: 'สร้างเป็นสินค้าใหม่',
                    });
                    if (ok) send(shop, action, true);
                    return;
                }
                if (!res.ok || !body.job_id) {
                    setMessage({ severity: 'error', text: body.message ?? `${ACTION_LABEL[action]} ไม่สำเร็จ` });
                    setBusyShop(null);
                    return;
                }
                setMessage({ severity: 'information', text: body.message ?? `${ACTION_LABEL[action]} ${shop.name} — เข้าคิวแล้ว` });
                pollJob(body.job_id, shop.name, action);
            })
            .catch(() => {
                setMessage({ severity: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
                setBusyShop(null);
            });
    };

    const ask = async (shop: ShopRow, action: 'push' | 'deactivate' | 'delete') => {
        const text = {
            push: {
                title: `Push ไป ${shop.name}?`,
                message: `ส่งข้อมูลสินค้าจาก PIM ขึ้น ${platformLabel} (${shop.name}) — เขียนลงหน้าร้านจริง`,
                label: 'Push',
                destructive: false,
            },
            deactivate: {
                title: `ปิดการขายบน ${shop.name}?`,
                message: `ซ่อน listing ออกจากหน้าร้าน ${platformLabel} (${shop.name}) — เปิดกลับได้ด้วยการ Push อีกครั้ง`,
                label: 'ปิดการขาย',
                destructive: true,
            },
            delete: {
                title: `ลบ listing บน ${shop.name} ถาวร?`,
                message: `ลบสินค้าออกจาก ${platformLabel} (${shop.name}) ถาวร ย้อนกลับไม่ได้ — ต้องสร้าง listing ใหม่ทั้งหมดถ้าจะขายอีก`,
                label: 'ลบถาวร',
                destructive: true,
            },
        }[action];
        const ok = await confirm({ title: text.title, message: text.message, confirmLabel: text.label, destructive: text.destructive });
        if (ok) send(shop, action);
    };

    const checkStatus = (shop: ShopRow) => {
        setBusyShop(shop.id);
        setMessage(null);
        fetch(`/catalog/products/${productId}/${routes.status}/${shop.id}`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || 'เช็คสถานะไม่สำเร็จ');
                // { is_live, never_pushed, status } — {Platform}ProductSyncService::checkLiveStatus()
                const detail = body.status ? ` (${body.status})` : '';
                const text = body.never_pushed
                    ? 'ยังไม่เคย Push / ไม่พบสินค้านี้บนร้าน'
                    : body.is_live
                      ? `Live บนร้าน${detail}`
                      : `ไม่ Live${detail}`;
                setMessage({ severity: 'information', text: `${shop.name}: ${text}` });
            })
            .catch((e: Error) => setMessage({ severity: 'error', text: e.message }))
            .finally(() => {
                setBusyShop(null);
                load();
            });
    };

    const togglePublished = (shop: ShopRow, published: boolean) => {
        setBusyShop(shop.id);
        fetch(`/catalog/products/${productId}/shops/${shop.id}/toggle-published`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ published }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error((await res.json()).message || 'บันทึกไม่สำเร็จ');
            })
            .catch((e: Error) => setMessage({ severity: 'error', text: e.message }))
            .finally(() => {
                setBusyShop(null);
                load();
            });
    };

    // WooCommerce เท่านั้น: ส่งชื่อภาษาอังกฤษของสินค้าเข้า dictionary ของ TranslatePress (คนละ action
    // กับ push listing — ย้ายมาจาก push dialog เดิมของหน้าแก้ไขสินค้า) server บังคับคำแปลครบ 100%
    // เอง — ดู ProductController::fillWoocommerceTranslationsForProduct()
    const [fillingTranslation, setFillingTranslation] = useState(false);
    const TRANSLATION_STATUS: Record<string, string> = {
        upserted: 'ส่งคำแปลไปยัง TranslatePress แล้ว',
        skipped_no_english_name: 'ยังไม่ได้ตั้งชื่อภาษาอังกฤษไว้ใน PIM สำหรับสินค้านี้ — ไม่มีอะไรให้ส่ง',
        skipped_not_tracked: 'TranslatePress ยังไม่เคยเห็นหน้าสินค้านี้ — เปิดดูหน้าสินค้าบนเว็บไซต์จริงก่อน แล้วลองใหม่',
        not_live_on_woocommerce: 'สินค้านี้ยังไม่ได้เผยแพร่บน WooCommerce ในขณะนี้',
    };
    const fillTranslation = () => {
        setFillingTranslation(true);
        setMessage(null);
        fetch(`/catalog/products/${productId}/fill-woocommerce-translations`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || 'ส่งคำแปลไม่สำเร็จ');
                setMessage({
                    severity: body.status === 'upserted' ? 'success' : 'information',
                    text: TRANSLATION_STATUS[body.status as string] ?? body.message ?? 'ส่งคำแปลแล้ว',
                });
            })
            .catch((e: Error) => setMessage({ severity: 'error', text: e.message }))
            .finally(() => setFillingTranslation(false));
    };

    const blockers: string[] = [];
    if (data && !data.product.enabled) blockers.push('สินค้านี้ปิด "การเผยแพร่" อยู่ — เปิดที่หน้าแก้ไขสินค้าก่อน');
    if (data && !data.product.status_allows_publish) blockers.push(`สถานะสินค้า "${data.product.status ?? '—'}" ยัง Push ไม่ได้ — ต้องเป็น Active`);
    if (data && !data.can_push) blockers.push(`คุณไม่มีสิทธิ์ Push สินค้าไป ${platformLabel}`);
    const canWrite = blockers.length === 0;

    const columns: FioriResponsiveColumn<ShopRow>[] = [
        {
            key: 'publish',
            header: 'เผยแพร่',
            priority: 'always',
            width: 72,
            minWidth: 72,
            render: (shop) => (
                <CheckBox
                    accessibleName={`เผยแพร่ไป ${shop.name}`}
                    checked={shop.published}
                    disabled={!data?.can_toggle || busyShop !== null}
                    onChange={(e) => togglePublished(shop, e.target.checked)}
                />
            ),
        },
        { key: 'shop', header: 'ร้าน', priority: 'always', minWidth: 180, render: (shop) => <Text style={{ fontWeight: 600 }}>{shop.name}</Text> },
        {
            key: 'live',
            header: `สถานะบน ${platformLabel}`,
            priority: 'high',
            minWidth: 140,
            render: (shop) =>
                shop.is_live ? (
                    <ObjectStatus state="Positive" showDefaultIcon title={shop.live_synced_at ? `ยืนยัน ณ ${when(shop.live_synced_at)}` : undefined}>
                        Live
                    </ObjectStatus>
                ) : (
                    <ObjectStatus state="None">ยังไม่ Live</ObjectStatus>
                ),
        },
        {
            key: 'matching',
            header: 'Product Matching',
            priority: 'medium',
            minWidth: 150,
            render: (shop) =>
                shop.known ? (
                    <ObjectStatus state="Positive">จับคู่แล้ว (อัปเดต)</ObjectStatus>
                ) : (
                    <ObjectStatus state="Critical" showDefaultIcon title="Push จะสร้าง listing ใหม่ — ต้องยืนยันก่อน">
                        จะสร้างใหม่
                    </ObjectStatus>
                ),
        },
        {
            key: 'job',
            header: 'งานล่าสุด',
            priority: 'low',
            minWidth: 170,
            render: (shop) =>
                shop.last_job ? (
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <ObjectStatus state={JOB_STATE[shop.last_job.status]?.state ?? 'None'}>
                            {ACTION_LABEL[shop.last_job.action] ?? shop.last_job.action} ·{' '}
                            {JOB_STATE[shop.last_job.status]?.label ?? shop.last_job.status}
                        </ObjectStatus>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' }}>
                            {when(shop.last_job.created_at)}
                        </Text>
                    </span>
                ) : (
                    <Text>—</Text>
                ),
        },
        {
            key: 'actions',
            header: '',
            popinText: 'จัดการ',
            priority: 'always',
            align: 'right',
            minWidth: 260,
            render: (shop) => {
                const busy = busyShop === shop.id;
                const writable = canWrite && shop.published && busyShop === null;
                return (
                    <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Button
                            design="Emphasized"
                            icon="upload-to-cloud"
                            disabled={!writable || !reviewReady}
                            loading={busy}
                            loadingDelay={0}
                            tooltip={!shop.published ? 'ติ๊ก "เผยแพร่" ร้านนี้ก่อน' : !reviewReady ? 'ข้อมูลยังไม่พร้อม — ดูผลตรวจด้านบน' : undefined}
                            onClick={() => ask(shop, 'push')}
                        >
                            Push
                        </Button>
                        <Button
                            design="Transparent"
                            icon="refresh"
                            tooltip="เช็คสถานะบนร้าน"
                            accessibleName="เช็คสถานะบนร้าน"
                            disabled={!data?.can_push || busyShop !== null}
                            onClick={() => checkStatus(shop)}
                        />
                        {shop.is_live && (
                            <Button
                                design="Transparent"
                                icon="hide"
                                tooltip="ปิดการขาย"
                                accessibleName="ปิดการขาย"
                                disabled={!data?.can_push || !shop.published || busyShop !== null}
                                onClick={() => ask(shop, 'deactivate')}
                            />
                        )}
                        {shop.is_live && routes.delete && (
                            <Button
                                design="Transparent"
                                icon="delete"
                                tooltip="ลบ listing ถาวร"
                                accessibleName="ลบ listing ถาวร"
                                style={{ color: 'var(--sapNegativeColor)' }}
                                disabled={!data?.can_push || !shop.published || busyShop !== null}
                                onClick={() => ask(shop, 'delete')}
                            />
                        )}
                    </span>
                );
            },
        },
    ];

    const historyColumns: FioriResponsiveColumn<SyncJob>[] = [
        { key: 'when', header: 'เวลา', priority: 'always', minWidth: 150, render: (j) => <Text>{when(j.created_at)}</Text> },
        { key: 'shop', header: 'ร้าน', priority: 'high', minWidth: 140, render: (j) => <Text>{j.shop ?? '—'}</Text> },
        { key: 'action', header: 'การทำงาน', priority: 'always', minWidth: 100, render: (j) => <Text>{ACTION_LABEL[j.action] ?? j.action}</Text> },
        {
            key: 'status',
            header: 'ผล',
            priority: 'always',
            minWidth: 100,
            render: (j) => <ObjectStatus state={JOB_STATE[j.status]?.state ?? 'None'}>{JOB_STATE[j.status]?.label ?? j.status}</ObjectStatus>,
        },
        { key: 'message', header: 'ข้อความ', priority: 'medium', minWidth: 200, render: (j) => <Text maxLines={2}>{j.message ?? '—'}</Text> },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {confirmElement}
            <Toolbar design="Transparent" style={{ padding: 0 }}>
                <Text>Push ได้ทีละร้าน — ติ๊ก &quot;เผยแพร่&quot; ร้านที่จะขาย แล้วกด Push</Text>
                <ToolbarSpacer />
                <Button design="Transparent" icon="refresh" disabled={loading} onClick={load}>
                    โหลดสถานะใหม่
                </Button>
            </Toolbar>

            {blockers.map((b) => (
                <FioriMessageStrip key={b} severity="warning">
                    {b}
                    {b.includes('การเผยแพร่') && (
                        <>
                            {' '}
                            <Link href={`/catalog/products/${productId}/edit`}>ไปหน้าแก้ไขสินค้า</Link>
                        </>
                    )}
                </FioriMessageStrip>
            ))}
            {message && (
                <FioriMessageStrip severity={message.severity} onClose={() => setMessage(null)}>
                    {message.text}
                </FioriMessageStrip>
            )}

            {activated && isReviewablePlatform(platform) && (
                <FioriFormGroup
                    title="ตรวจความพร้อมก่อน Push"
                    description="ข้อมูลที่จะส่งขึ้นร้านต้องครบก่อนจึงจะกด Push ได้ — แก้ได้ที่ step ก่อนหน้า"
                >
                    <MarketplacePushReview
                        key={productId}
                        productId={productId}
                        platform={platform as ReviewablePlatform}
                        onReadyChange={setReviewReady}
                        showSavedDataNote={false}
                    />
                </FioriFormGroup>
            )}

            <FioriFormGroup title={`ร้าน ${platformLabel}`}>
                <FioriResponsiveTable
                    columns={columns}
                    rows={data?.shops ?? []}
                    getRowKey={(s) => s.id}
                    loading={loading}
                    variant="plain"
                    emptyMessage={`ยังไม่มีร้าน ${platformLabel} ที่คุณเข้าถึงได้`}
                />
            </FioriFormGroup>

            {platform === 'woocommerce' && (
                <FioriFormGroup
                    title="คำแปลชื่อสินค้า (TranslatePress)"
                    description="ส่งชื่อภาษาอังกฤษของสินค้านี้เข้า dictionary ของ TranslatePress — ทำได้เมื่อคำแปลครบ 100%"
                >
                    <div>
                        <Button
                            icon="upload-to-cloud"
                            disabled={!data?.can_push || fillingTranslation}
                            loading={fillingTranslation}
                            loadingDelay={0}
                            onClick={fillTranslation}
                        >
                            ส่งคำแปลชื่อสินค้า
                        </Button>
                    </div>
                </FioriFormGroup>
            )}

            <FioriFormGroup title="ประวัติการส่งข้อมูล (ล่าสุด 10 รายการ)">
                <FioriResponsiveTable
                    columns={historyColumns}
                    rows={data?.history ?? []}
                    getRowKey={(j) => j.id}
                    variant="plain"
                    emptyMessage="ยังไม่เคยส่งข้อมูลขึ้นร้าน"
                />
            </FioriFormGroup>
        </div>
    );
}
