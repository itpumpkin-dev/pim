import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriField, ui5ValueState } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/overflow.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import { Bar, Button, Dialog, Input, Label, Menu, MenuItem, MenuSeparator, Switch, Tab, TabContainer } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, masterStyles } from '../master-crud';

// จำนวนร้านค้าที่โชว์ก่อนจะสลับเป็นปุ่ม "ดูทั้งหมด" — ตั้งไว้พอให้เห็นภาพรวมของลิสต์
// โดยไม่ทำให้ตารางยาวเกินจอสำหรับ platform ที่มีร้านค้าเยอะๆ
const SHOPS_PREVIEW_COUNT = 3;

interface ShopItem {
    id: number;
    code: string;
    name: string;
    lazada_seller_account_id: number | null;
    shopee_seller_account_id: string | null;
    tiktok_seller_account_id: number | null;
    is_active: boolean;
    // true เมื่อระบบอ้าง code นี้ตรงๆ (ดู SalesPlatformController) — แก้ไม่ได้แม้มีสิทธิ์ edit_code
    code_locked?: boolean;
}

interface PlatformItem {
    id: number;
    code: string;
    name: string;
    shops: ShopItem[];
    code_locked?: boolean;
}

interface Props {
    platforms: PlatformItem[];
}

function linkedAccountLabel(shop: ShopItem): string | null {
    if (shop.lazada_seller_account_id) return `Lazada #${shop.lazada_seller_account_id}`;
    if (shop.shopee_seller_account_id) return `Shopee #${shop.shopee_seller_account_id}`;
    if (shop.tiktok_seller_account_id) return `TikTok #${shop.tiktok_seller_account_id}`;
    return null;
}

export default function SalesPlatformIndex({ platforms }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('sales_platforms.create_sales_platforms');
    const canEdit = permissions.includes('sales_platforms.edit_sales_platforms');
    const canDelete = permissions.includes('sales_platforms.delete_sales_platforms');
    // แก้ code ได้เฉพาะคนที่มีสิทธิ์ sales_platforms.edit_code (เช็คซ้ำฝั่ง server
    // ด้วย CodeRenameGuard ใน SalesPlatformController)
    const canEditCodePermission = permissions.includes('sales_platforms.edit_code');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
    ];

    const [activePlatformId, setActivePlatformId] = useState<number | null>(platforms[0]?.id ?? null);
    const activePlatform = platforms.find((p) => p.id === activePlatformId) ?? platforms[0] ?? null;
    const [showAllShops, setShowAllShops] = useState(false);

    const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<PlatformItem | null>(null);
    const [platformCode, setPlatformCode] = useState('');
    const [platformName, setPlatformName] = useState('');
    const [platformCodeError, setPlatformCodeError] = useState<string | undefined>();
    const [deletePlatformId, setDeletePlatformId] = useState<number | null>(null);
    const [savingPlatform, setSavingPlatform] = useState(false);
    const [deletingPlatform, setDeletingPlatform] = useState(false);
    const [platformMenuAnchor, setPlatformMenuAnchor] = useState<HTMLElement | null>(null);

    const [shopDialogPlatformId, setShopDialogPlatformId] = useState<number | null>(null);
    const [editingShop, setEditingShop] = useState<ShopItem | null>(null);
    const [shopCode, setShopCode] = useState('');
    const [shopName, setShopName] = useState('');
    const [shopCodeError, setShopCodeError] = useState<string | undefined>();
    const [shopActive, setShopActive] = useState(true);
    const [deleteShopId, setDeleteShopId] = useState<number | null>(null);
    const [savingShop, setSavingShop] = useState(false);
    const [deletingShop, setDeletingShop] = useState(false);
    const [shopMenuAnchor, setShopMenuAnchor] = useState<{ shopId: number; el: HTMLElement } | null>(null);

    const [syncMenuAnchor, setSyncMenuAnchor] = useState<HTMLElement | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncingShopee, setSyncingShopee] = useState(false);
    const [syncingTiktok, setSyncingTiktok] = useState(false);
    const [syncingLiveStatus, setSyncingLiveStatus] = useState(false);
    const anySyncing = syncing || syncingShopee || syncingTiktok || syncingLiveStatus;

    const openCreatePlatform = () => {
        setEditingPlatform(null);
        setPlatformCode('');
        setPlatformName('');
        setPlatformDialogOpen(true);
    };

    const openEditPlatform = (platform: PlatformItem) => {
        setEditingPlatform(platform);
        setPlatformCode(platform.code);
        setPlatformName(platform.name);
        setPlatformCodeError(undefined);
        setPlatformDialogOpen(true);
    };

    const submitPlatform = (e: FormEvent) => {
        e.preventDefault();
        setSavingPlatform(true);
        if (editingPlatform) {
            router.put(
                `/catalog/sales-platforms/${editingPlatform.id}`,
                { code: platformCode, name: platformName },
                {
                    onSuccess: () => setPlatformDialogOpen(false),
                    onError: (errors) => setPlatformCodeError(errors.code),
                    onFinish: () => setSavingPlatform(false),
                },
            );
        } else {
            router.post(
                '/catalog/sales-platforms',
                { name: platformName },
                {
                    onSuccess: () => setPlatformDialogOpen(false),
                    onFinish: () => setSavingPlatform(false),
                },
            );
        }
    };

    const openCreateShop = (platformId: number) => {
        setShopDialogPlatformId(platformId);
        setEditingShop(null);
        setShopCode('');
        setShopName('');
        setShopActive(true);
    };

    const openEditShop = (platformId: number, shop: ShopItem) => {
        setShopDialogPlatformId(platformId);
        setEditingShop(shop);
        setShopCode(shop.code);
        setShopName(shop.name);
        setShopCodeError(undefined);
        setShopActive(shop.is_active);
    };

    const submitShop = (e: FormEvent) => {
        e.preventDefault();
        setSavingShop(true);
        if (editingShop) {
            router.put(
                `/catalog/sales-platforms/shops/${editingShop.id}`,
                { code: shopCode, name: shopName, is_active: shopActive },
                {
                    onSuccess: () => setShopDialogPlatformId(null),
                    onError: (errors) => setShopCodeError(errors.code),
                    onFinish: () => setSavingShop(false),
                },
            );
        } else if (shopDialogPlatformId) {
            router.post(
                `/catalog/sales-platforms/${shopDialogPlatformId}/shops`,
                { name: shopName, is_active: shopActive },
                {
                    onSuccess: () => setShopDialogPlatformId(null),
                    onFinish: () => setSavingShop(false),
                },
            );
        }
    };

    const syncLazada = () => {
        setSyncing(true);
        router.post('/catalog/sales-platforms/sync-lazada', {}, { onFinish: () => setSyncing(false) });
    };

    const syncShopee = () => {
        setSyncingShopee(true);
        router.post('/catalog/sales-platforms/sync-shopee', {}, { onFinish: () => setSyncingShopee(false) });
    };

    const syncTiktok = () => {
        setSyncingTiktok(true);
        router.post('/catalog/sales-platforms/sync-tiktok', {}, { onFinish: () => setSyncingTiktok(false) });
    };

    const syncLiveStatus = () => {
        setSyncingLiveStatus(true);
        router.post('/catalog/sales-platforms/sync-live-status', {}, { onFinish: () => setSyncingLiveStatus(false) });
    };

    // sync แยกตามร้าน — ใช้ Set (ไม่ใช่ id เดี่ยวๆ) เพราะอาจมีหลายร้านที่กำลัง
    // sync พร้อมกันได้ เหตุผลเดียวกับ duplicatingIds ใน products/index.tsx
    const [syncingShopIds, setSyncingShopIds] = useState<Set<number>>(new Set());
    const syncShopLiveStatus = (shopId: number) => {
        setSyncingShopIds((prev) => new Set(prev).add(shopId));
        router.post(
            `/catalog/sales-platforms/shops/${shopId}/sync-live-status`,
            {},
            {
                onFinish: () =>
                    setSyncingShopIds((prev) => {
                        const next = new Set(prev);
                        next.delete(shopId);
                        return next;
                    }),
            },
        );
    };

    const menuShop = activePlatform?.shops.find((s) => s.id === shopMenuAnchor?.shopId) ?? null;
    const visibleShops = activePlatform ? (showAllShops ? activePlatform.shops : activePlatform.shops.slice(0, SHOPS_PREVIEW_COUNT)) : [];

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // ชื่อ/code ของร้านกับปุ่มเมนู action จะยังโชว์อยู่แม้จอมือถือแคบๆ
    // ส่วนคอลัมน์บัญชีที่ลิงก์กับสถานะ active เป็นข้อมูลรองเลยถูกซ่อนก่อน
    const shopColumns: FioriResponsiveColumn<ShopItem>[] = [
        {
            key: 'shop',
            header: t('shopsLabel'),
            priority: 'always',
            render: (shop) => (
                <div>
                    <div className={masterStyles.strong}>{shop.name}</div>
                    <div className={masterStyles.secondary} style={{ fontSize: 'var(--sapFontSmallSize)' }}>
                        {shop.code}
                    </div>
                </div>
            ),
        },
        {
            key: 'linkedAccount',
            header: t('linkedPlatformAccount'),
            priority: 'high',
            render: (shop) =>
                linkedAccountLabel(shop) ?? (
                    <span style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>{t('noLinkedAccount')}</span>
                ),
        },
        {
            key: 'active',
            header: t('shopActive'),
            priority: 'medium',
            render: (shop) => (shop.is_active ? <FioriStatus label={t('shopActive')} tone="success" /> : <FioriStatus label="-" tone="neutral" />),
        },
        {
            key: 'actions',
            header: '',
            priority: 'always',
            align: 'right',
            width: 48,
            render: (shop) =>
                (canEdit || canDelete) && (
                    <Button
                        design="Transparent"
                        icon="overflow"
                        tooltip={t('editShop')}
                        accessibleName={t('editShop')}
                        onClick={(e) => e.currentTarget && setShopMenuAnchor({ shopId: shop.id, el: e.currentTarget })}
                    />
                ),
        },
    ];

    const closeSyncMenu = () => setSyncMenuAnchor(null);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('salesPlatformsTitle')} />
            <MasterListPage
                before={<SalesChannelSectionTabs active="platforms" />}
                title={t('salesPlatformsTitle')}
                intro={t('salesPlatformsSubtitle')}
                addLabel={t('createPlatform')}
                onAdd={canCreate ? openCreatePlatform : undefined}
                actions={
                    <Button
                        icon="synchronize"
                        endIcon="slim-arrow-down"
                        disabled={anySyncing}
                        loading={anySyncing}
                        loadingDelay={0}
                        onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
                    >
                        {t('syncData')}
                    </Button>
                }
            >
                {platforms.length === 0 ? (
                    <div className={masterStyles.emptyPanel} style={{ maxWidth: 'none' }}>
                        <span className={masterStyles.muted}>{t('noPlatformsFound')}</span>
                    </div>
                ) : (
                    <div
                        style={{
                            background: 'var(--sapGroup_ContentBackground)',
                            border: '1px solid var(--sapGroup_ContentBorderColor)',
                            borderRadius: 'var(--sapElement_BorderCornerRadius)',
                            overflow: 'hidden',
                        }}
                    >
                        <TabContainer
                            collapsed
                            onTabSelect={(e) => {
                                const id = Number(e.detail.tab.dataset.platformId);
                                if (!Number.isNaN(id)) {
                                    setActivePlatformId(id);
                                    setShowAllShops(false);
                                }
                            }}
                        >
                            {platforms.map((platform) => (
                                <Tab
                                    key={platform.id}
                                    data-platform-id={platform.id}
                                    text={platform.name}
                                    additionalText={String(platform.shops.length)}
                                    selected={platform.id === activePlatform?.id}
                                />
                            ))}
                        </TabContainer>

                        {activePlatform && (
                            <>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.5rem 1rem',
                                        borderBottom: '1px solid var(--sapGroup_ContentBorderColor)',
                                    }}
                                >
                                    {canEdit && (
                                        <Button design="Transparent" icon="add" onClick={() => openCreateShop(activePlatform.id)}>
                                            {t('addShop')}
                                        </Button>
                                    )}
                                    {(canEdit || canDelete) && (
                                        <Button
                                            design="Transparent"
                                            icon="overflow"
                                            tooltip={t('editPlatform')}
                                            accessibleName={t('editPlatform')}
                                            onClick={(e) => setPlatformMenuAnchor(e.currentTarget)}
                                        />
                                    )}
                                </div>

                                <FioriResponsiveTable
                                    variant="plain"
                                    columns={shopColumns}
                                    rows={visibleShops}
                                    getRowKey={(shop) => shop.id}
                                    emptyMessage={t('noShopsYet')}
                                />

                                {activePlatform.shops.length > SHOPS_PREVIEW_COUNT && (
                                    <div style={{ padding: '0.75rem 1.25rem' }}>
                                        <Button design="Transparent" onClick={() => setShowAllShops((v) => !v)}>
                                            {showAllShops ? t('showFewerShops') : t('viewAllShops', { count: activePlatform.shops.length })}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </MasterListPage>

            <Menu opener={syncMenuAnchor} open={Boolean(syncMenuAnchor)} onClose={closeSyncMenu}>
                <MenuItem
                    text={syncing ? t('syncingLazada') : t('syncFromLazada')}
                    disabled={syncing}
                    onClick={() => {
                        closeSyncMenu();
                        syncLazada();
                    }}
                />
                <MenuItem
                    text={syncingShopee ? t('syncingLazada') : t('syncFromShopee')}
                    disabled={syncingShopee}
                    onClick={() => {
                        closeSyncMenu();
                        syncShopee();
                    }}
                />
                <MenuItem
                    text={syncingTiktok ? t('syncingTiktok') : t('syncFromTiktok')}
                    disabled={syncingTiktok}
                    onClick={() => {
                        closeSyncMenu();
                        syncTiktok();
                    }}
                />
                <MenuSeparator />
                <MenuItem
                    text={syncingLiveStatus ? t('syncingLiveStatus') : t('syncLiveStatus')}
                    disabled={syncingLiveStatus}
                    onClick={() => {
                        closeSyncMenu();
                        syncLiveStatus();
                    }}
                />
            </Menu>

            <Menu
                opener={platformMenuAnchor}
                open={Boolean(platformMenuAnchor) && Boolean(activePlatform)}
                onClose={() => setPlatformMenuAnchor(null)}
            >
                {canEdit && activePlatform && (
                    <MenuItem
                        icon="edit"
                        text={t('editPlatform')}
                        onClick={() => {
                            setPlatformMenuAnchor(null);
                            openEditPlatform(activePlatform);
                        }}
                    />
                )}
                {canDelete && activePlatform && (
                    <MenuItem
                        icon="delete"
                        text={tGrid('delete')}
                        onClick={() => {
                            setPlatformMenuAnchor(null);
                            setDeletePlatformId(activePlatform.id);
                        }}
                    />
                )}
            </Menu>

            <Menu opener={shopMenuAnchor?.el ?? null} open={Boolean(shopMenuAnchor)} onClose={() => setShopMenuAnchor(null)}>
                {menuShop && canEdit && menuShop.lazada_seller_account_id && (
                    <MenuItem
                        icon="synchronize"
                        text={t('syncLiveStatus')}
                        disabled={syncingShopIds.has(menuShop.id)}
                        loading={syncingShopIds.has(menuShop.id)}
                        onClick={() => {
                            const shopId = menuShop.id;
                            setShopMenuAnchor(null);
                            syncShopLiveStatus(shopId);
                        }}
                    />
                )}
                {menuShop && canEdit && activePlatform && (
                    <MenuItem
                        icon="edit"
                        text={t('editShop')}
                        onClick={() => {
                            openEditShop(activePlatform.id, menuShop);
                            setShopMenuAnchor(null);
                        }}
                    />
                )}
                {menuShop && canDelete && (
                    <MenuItem
                        icon="delete"
                        text={tGrid('delete')}
                        onClick={() => {
                            setDeleteShopId(menuShop.id);
                            setShopMenuAnchor(null);
                        }}
                    />
                )}
            </Menu>

            <Dialog
                open={platformDialogOpen}
                headerText={editingPlatform ? t('editPlatform') : t('createPlatform')}
                style={{ width: 'min(26rem, calc(100vw - 2rem))' }}
                onClose={() => setPlatformDialogOpen(false)}
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button
                                    onClick={() => (document.getElementById('sales-platform-form') as HTMLFormElement | null)?.requestSubmit()}
                                    design="Emphasized"
                                    disabled={savingPlatform}
                                    loading={savingPlatform}
                                    loadingDelay={0}
                                >
                                    {t('save')}
                                </Button>
                                <Button design="Transparent" disabled={savingPlatform} onClick={() => setPlatformDialogOpen(false)}>
                                    {tGrid('cancel')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <form id="sales-platform-form" onSubmit={submitPlatform} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {editingPlatform && (
                        <FioriField
                            label={t('platformCode')}
                            htmlFor="platform-code"
                            valueState={platformCodeError ? 'error' : 'none'}
                            message={platformCodeError}
                            hint={t(codeHintKey({ canEditCode: canEditCodePermission, codeLocked: editingPlatform.code_locked }))}
                            fullWidth
                            labelWidth={120}
                        >
                            <Input
                                id="platform-code"
                                value={platformCode}
                                maxlength={50}
                                disabled={!canEditCodePermission || !!editingPlatform.code_locked}
                                valueState={ui5ValueState(platformCodeError ? 'error' : 'none')}
                                onInput={(e) => setPlatformCode(normalizeCodeInput(e.target.value))}
                            />
                        </FioriField>
                    )}
                    <FioriField label={t('platformName')} htmlFor="platform-name" required fullWidth labelWidth={120}>
                        <Input id="platform-name" required value={platformName} onInput={(e) => setPlatformName(e.target.value)} />
                    </FioriField>
                </form>
            </Dialog>

            <Dialog
                open={shopDialogPlatformId !== null}
                headerText={editingShop ? t('editShop') : t('addShop')}
                style={{ width: 'min(26rem, calc(100vw - 2rem))' }}
                onClose={() => setShopDialogPlatformId(null)}
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button
                                    onClick={() => (document.getElementById('sales-shop-form') as HTMLFormElement | null)?.requestSubmit()}
                                    design="Emphasized"
                                    disabled={savingShop}
                                    loading={savingShop}
                                    loadingDelay={0}
                                >
                                    {t('save')}
                                </Button>
                                <Button design="Transparent" disabled={savingShop} onClick={() => setShopDialogPlatformId(null)}>
                                    {tGrid('cancel')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <form id="sales-shop-form" onSubmit={submitShop} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {editingShop && (
                        <FioriField
                            label={t('shopCode')}
                            htmlFor="shop-code"
                            valueState={shopCodeError ? 'error' : 'none'}
                            message={shopCodeError}
                            hint={t(codeHintKey({ canEditCode: canEditCodePermission, codeLocked: editingShop.code_locked }))}
                            fullWidth
                            labelWidth={120}
                        >
                            <Input
                                id="shop-code"
                                value={shopCode}
                                maxlength={100}
                                disabled={!canEditCodePermission || !!editingShop.code_locked}
                                valueState={ui5ValueState(shopCodeError ? 'error' : 'none')}
                                onInput={(e) => setShopCode(normalizeCodeInput(e.target.value))}
                            />
                        </FioriField>
                    )}
                    <FioriField label={t('shopName')} htmlFor="shop-name" required fullWidth labelWidth={120}>
                        <Input id="shop-name" required value={shopName} onInput={(e) => setShopName(e.target.value)} />
                    </FioriField>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Switch id="shop-active" checked={shopActive} onChange={(e) => setShopActive(e.target.checked)} />
                        <Label for="shop-active" showColon={false}>
                            {t('shopActive')}
                        </Label>
                    </div>
                </form>
            </Dialog>

            <FioriMessageBox
                open={deletePlatformId !== null}
                onCancel={() => setDeletePlatformId(null)}
                onConfirm={() => {
                    if (deletePlatformId !== null) {
                        setDeletingPlatform(true);
                        router.delete(`/catalog/sales-platforms/${deletePlatformId}`, {
                            onSuccess: () => setDeletePlatformId(null),
                            onFinish: () => setDeletingPlatform(false),
                        });
                    }
                }}
                title={tGrid('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={tGrid('delete')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={deletingPlatform}
            >
                {t('confirmDeletePlatform')}
            </FioriMessageBox>

            <FioriMessageBox
                open={deleteShopId !== null}
                onCancel={() => setDeleteShopId(null)}
                onConfirm={() => {
                    if (deleteShopId !== null) {
                        setDeletingShop(true);
                        router.delete(`/catalog/sales-platforms/shops/${deleteShopId}`, {
                            onSuccess: () => setDeleteShopId(null),
                            onFinish: () => setDeletingShop(false),
                        });
                    }
                }}
                title={tGrid('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={tGrid('delete')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={deletingShop}
            >
                {t('confirmDeleteShop')}
            </FioriMessageBox>
        </AppLayout>
    );
}
