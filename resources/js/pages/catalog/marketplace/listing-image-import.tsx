import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriResponsiveTable } from '@/components/fiori-responsive-table';
import '@ui5/webcomponents-icons/dist/alert.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/message-information.js';
import '@ui5/webcomponents-icons/dist/navigation-left-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/reset.js';
import '@ui5/webcomponents-icons/dist/save.js';
import {
    BusyIndicator,
    Button,
    CheckBox,
    Icon,
    Label,
    ObjectStatus,
    Popover,
    SegmentedButton,
    SegmentedButtonItem,
    Text,
    Toolbar,
    ToolbarSpacer,
} from '@ui5/webcomponents-react';
import { useState, type CSSProperties } from 'react';

import { imageIssues, imagePlatformOrder, PLATFORM_IMAGE_RULES, type ImageMeta, type ImagePlatform } from './marketplace-image-rules';

const xsrfToken = () =>
    decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );

export interface ImagePlan {
    status: 'ready' | 'empty' | 'unsupported' | 'not_in_family' | 'no_permission';
    reason: string | null;
    /** gallery cap (ListingImageImportService::MAX_IMAGES) */
    max: number;
    current: { path: string; url: string }[];
    source: string[];
    default_mode: 'replace' | 'append';
}

export interface GalleryImage extends ImageMeta {
    path: string;
    url: string;
}

export interface GalleryState {
    status: 'ready' | 'unsupported' | 'not_in_family' | 'no_permission';
    reason: string | null;
    attribute_id: number | null;
    max: number;
    current: GalleryImage[];
}

const THUMB = 88;

/** รูปขั้นต่ำเท่าหน้าแก้ไขสินค้า (ProductController::validateImageConstraints เช็คซ้ำฝั่ง server) */
const MIN_DIMENSION = 300;

const probeDimensions = (file: File) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('unreadable'));
        };
        img.src = url;
    });

/** ตารางสรุปผลตรวจรูปตามเงื่อนไขของทุกแพลตฟอร์ม (แพลตฟอร์มของหน้านี้ขึ้นก่อน) */
function PlatformImageCheck({ items, platform }: { items: GalleryImage[]; platform: ImagePlatform }) {
    const rows = imagePlatformOrder(platform).map((key) => {
        const rule = PLATFORM_IMAGE_RULES[key];
        const failing = items.map((img, i) => ({ n: i + 1, issues: imageIssues(rule, img) })).filter((r) => r.issues.length > 0);
        const over = rule.max !== undefined && items.length > rule.max ? items.length - rule.max : 0;
        return { key, rule, failing, over };
    });

    return (
        <FioriResponsiveTable
            columns={[
                {
                    key: 'platform',
                    header: 'แพลตฟอร์ม',
                    width: '9rem',
                    render: (r) => (
                        <span style={{ fontWeight: r.key === platform ? 700 : 400 }}>
                            {r.rule.label}
                            {r.key === platform && ' (หน้านี้)'}
                        </span>
                    ),
                },
                {
                    key: 'rule',
                    header: 'เงื่อนไขรูป',
                    priority: 'medium',
                    render: (r) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span>{r.rule.summary}</span>
                            {r.rule.tip && (
                                <span style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>{r.rule.tip}</span>
                            )}
                        </div>
                    ),
                },
                {
                    key: 'result',
                    header: 'ผลตรวจ',
                    priority: 'high',
                    minWidth: '12rem',
                    render: (r) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {items.length === 0 ? (
                                <ObjectStatus state="None">ยังไม่มีรูป</ObjectStatus>
                            ) : r.failing.length === 0 && r.over === 0 ? (
                                <ObjectStatus state="Positive" showDefaultIcon>
                                    ผ่านทุกรูป
                                </ObjectStatus>
                            ) : (
                                <>
                                    {r.failing.map((f) => (
                                        <ObjectStatus key={f.n} state="Critical" showDefaultIcon>
                                            {`รูปที่ ${f.n}: ${f.issues.join(' · ')}`}
                                        </ObjectStatus>
                                    ))}
                                    {r.over > 0 && (
                                        <ObjectStatus state="Critical" showDefaultIcon>
                                            {`เกิน ${r.rule.max} รูป — ส่งขึ้นร้านแค่ ${r.rule.max} รูปแรก`}
                                        </ObjectStatus>
                                    )}
                                </>
                            )}
                        </div>
                    ),
                },
            ]}
            rows={rows}
            getRowKey={(r) => r.key}
        />
    );
}

/**
 * แกลเลอรีใน PIM (`pgallery`) — อัปโหลดเพิ่ม (ProductController::uploadAttributeFile — ไฟล์ขึ้น disk ทันที
 * แต่ยังไม่เข้าแกลเลอรีจนกด "บันทึกแกลเลอรี") ลบ และจัดลำดับ (ลากวาง หรือปุ่ม ◀ ▶) แล้วบันทึกทั้งชุด
 * (ListingImageImportService::saveGallery) — แกลเลอรีชุดเดียวใช้กับทุกช่องทาง (pgallery ไม่ได้แยกตามช่องทาง)
 */
export function GalleryEditor({
    gallery,
    productId,
    platform,
    onDone,
}: {
    gallery: GalleryState;
    productId: number;
    /** แพลตฟอร์มของหน้าที่เปิดอยู่ — ใช้เตือนรูปที่ไม่ผ่านเงื่อนไขของแพลตฟอร์มนี้บน thumbnail */
    platform: ImagePlatform;
    onDone: (message: string) => void;
}) {
    const [items, setItems] = useState(gallery.current);
    const [uploading, setUploading] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [rulesOpener, setRulesOpener] = useState<HTMLElement | null>(null);

    const failingHere = items.filter((img) => imageIssues(PLATFORM_IMAGE_RULES[platform], img).length > 0).length;
    const dirty = items.map((i) => i.path).join('\n') !== gallery.current.map((i) => i.path).join('\n');
    const busy = saving || uploading > 0;
    const atLimit = items.length >= gallery.max;

    if (gallery.status !== 'ready') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <FioriMessageStrip severity="warning">{gallery.reason}</FioriMessageStrip>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {gallery.current.map((img) => (
                        <img key={img.path} src={img.url} alt="" loading="lazy" style={thumbStyle(false)} />
                    ))}
                </div>
            </div>
        );
    }

    const move = (from: number, to: number) => {
        if (to < 0 || to >= items.length || from === to) return;
        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const upload = async (list: FileList) => {
        setError(null);
        const room = gallery.max - items.length;
        const files = Array.from(list).slice(0, Math.max(room, 0));
        if (list.length > files.length) setError(`แกลเลอรีมีได้ไม่เกิน ${gallery.max} รูป — ข้าม ${list.length - files.length} ไฟล์`);

        for (const file of files) {
            let size: { width: number; height: number };
            try {
                size = await probeDimensions(file);
                const { width, height } = size;
                if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
                    setError(`${file.name}: รูปต้องมีขนาดอย่างน้อย ${MIN_DIMENSION}×${MIN_DIMENSION}px (ไฟล์นี้ ${width}×${height}px)`);
                    continue;
                }
            } catch {
                setError(`${file.name}: ไม่ใช่ไฟล์รูปภาพที่อ่านได้`);
                continue;
            }
            setUploading((n) => n + 1);
            const form = new FormData();
            form.append('file', file);
            try {
                const res = await fetch(`/catalog/products/${productId}/attributes/${gallery.attribute_id}/upload`, {
                    method: 'POST',
                    headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
                    body: form,
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body.errors?.file?.[0] ?? body.message ?? 'อัปโหลดไม่สำเร็จ');
                setItems((prev) =>
                    prev.length >= gallery.max
                        ? prev
                        : [...prev, { path: body.path, url: body.url, width: size.width, height: size.height, bytes: file.size }],
                );
            } catch (e) {
                setError(`${file.name}: ${(e as Error).message}`);
            } finally {
                setUploading((n) => n - 1);
            }
        }
    };

    const save = () => {
        setSaving(true);
        setError(null);
        fetch(`/catalog/marketplace/products/${productId}/gallery`, {
            method: 'PUT',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: items.map((i) => i.path) }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.errors?.paths?.[0] ?? body.message ?? 'บันทึกแกลเลอรีไม่สำเร็จ');
                onDone(body.message);
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setSaving(false));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem 0.5rem' }}>
                <Label showColon>
                    แกลเลอรีใน PIM ({items.length}/{gallery.max}) — ลากเพื่อจัดลำดับ รูปแรกคือรูปหลัก · ใช้กับทุกช่องทาง
                </Label>
                <Button
                    design="Transparent"
                    icon="message-information"
                    tooltip="เงื่อนไขรูปของแต่ละแพลตฟอร์ม"
                    accessibleName="เงื่อนไขรูปของแต่ละแพลตฟอร์ม"
                    onClick={(e) => setRulesOpener(rulesOpener ? null : (e.currentTarget as HTMLElement))}
                />
                {failingHere > 0 && (
                    <ObjectStatus state="Critical" showDefaultIcon>
                        {`${failingHere} รูปไม่ผ่านเงื่อนไข ${PLATFORM_IMAGE_RULES[platform].label}`}
                    </ObjectStatus>
                )}
            </div>
            {/* Popover อยู่ใน top layer — ตำแหน่งใน tree ไม่สำคัญ */}
            <Popover
                open={Boolean(rulesOpener)}
                opener={rulesOpener ?? undefined}
                onClose={() => setRulesOpener(null)}
                headerText="เงื่อนไขรูปของแต่ละแพลตฟอร์ม"
                placement="Bottom"
                horizontalAlign="Start"
            >
                <div style={{ width: 'min(44rem, 85vw)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>เตือนเท่านั้น — แกลเลอรีเดียวใช้กับทุกแพลตฟอร์ม</Text>
                    <PlatformImageCheck items={items} platform={platform} />
                </div>
            </Popover>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {items.length === 0 && <Text>— ยังไม่มีรูปในแกลเลอรี</Text>}
                {items.map((img, i) => (
                    <div
                        key={img.path}
                        draggable={!busy}
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex !== null) move(dragIndex, i);
                            setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.125rem',
                            opacity: dragIndex === i ? 0.4 : 1,
                            cursor: busy ? 'default' : 'grab',
                        }}
                    >
                        <GalleryThumb img={img} index={i} platform={platform} />
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Button
                                design="Transparent"
                                icon="navigation-left-arrow"
                                tooltip="เลื่อนไปก่อนหน้า"
                                accessibleName={`เลื่อนรูปที่ ${i + 1} ไปก่อนหน้า`}
                                disabled={busy || i === 0}
                                onClick={() => move(i, i - 1)}
                            />
                            <Text style={{ minWidth: '1.25rem', textAlign: 'center' }}>{i + 1}</Text>
                            <Button
                                design="Transparent"
                                icon="navigation-right-arrow"
                                tooltip="เลื่อนไปถัดไป"
                                accessibleName={`เลื่อนรูปที่ ${i + 1} ไปถัดไป`}
                                disabled={busy || i === items.length - 1}
                                onClick={() => move(i, i + 1)}
                            />
                            <Button
                                design="Transparent"
                                icon="delete"
                                tooltip="ลบออกจากแกลเลอรี"
                                accessibleName={`ลบรูปที่ ${i + 1}`}
                                disabled={busy}
                                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                            />
                        </div>
                    </div>
                ))}
                {uploading > 0 && (
                    <div style={{ ...thumbStyle(false), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BusyIndicator active size="S" />
                    </div>
                )}
            </div>

            <Toolbar design="Transparent" style={{ padding: 0, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 18rem', maxWidth: '28rem' }}>
                    <FioriFileUploader
                        placeholder={atLimit ? `ครบ ${gallery.max} รูปแล้ว` : 'เพิ่มรูป — เลือกหรือลากไฟล์มาวาง (JPG/PNG/WEBP ≤ 4MB)'}
                        accept="image/*"
                        multiple
                        disabled={busy || atLimit}
                        onSelect={upload}
                    />
                </div>
                <ToolbarSpacer />
                <Button design="Transparent" icon="reset" disabled={!dirty || busy} onClick={() => setItems(gallery.current)}>
                    ยกเลิก
                </Button>
                <Button design="Emphasized" icon="save" disabled={!dirty || busy} loading={saving} loadingDelay={0} onClick={save}>
                    บันทึกแกลเลอรี
                </Button>
            </Toolbar>

            {error && (
                <FioriMessageStrip severity="error" onClose={() => setError(null)}>
                    {error}
                </FioriMessageStrip>
            )}
        </div>
    );
}

/** thumbnail ในแกลเลอรี — กรอบส้ม + ไอคอนเตือนเมื่อรูปไม่ผ่านเงื่อนไขของแพลตฟอร์มของหน้านี้ (hover ดูรายละเอียด) */
function GalleryThumb({ img, index, platform }: { img: GalleryImage; index: number; platform: ImagePlatform }) {
    const rule = PLATFORM_IMAGE_RULES[platform];
    const issues = imageIssues(rule, img);
    return (
        <div style={{ position: 'relative' }} title={issues.length > 0 ? `${rule.label}: ${issues.join(' · ')}` : undefined}>
            <img
                src={img.url}
                alt={`รูปที่ ${index + 1}`}
                loading="lazy"
                draggable={false}
                style={{ ...thumbStyle(index === 0), ...(issues.length > 0 ? { borderColor: 'var(--sapCriticalColor)' } : {}) }}
            />
            {issues.length > 0 && (
                <Icon
                    name="alert"
                    accessibleName={`ไม่ผ่านเงื่อนไข ${rule.label}`}
                    style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: '1rem',
                        height: '1rem',
                        padding: 2,
                        borderRadius: '50%',
                        color: 'var(--sapCriticalColor)',
                        background: 'var(--sapGroup_ContentBackground)',
                    }}
                />
            )}
        </div>
    );
}

const thumbStyle = (selected: boolean): CSSProperties => ({
    width: THUMB,
    height: THUMB,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 'var(--sapElement_BorderCornerRadius)',
    border: `2px solid ${selected ? 'var(--sapSelectedColor)' : 'var(--sapGroup_ContentBorderColor)'}`,
    background: 'var(--sapField_Background)',
});

/**
 * เฟส 2 — รูปภาพ (ListingImageImportService): เลือกรูปบน platform (ลำดับที่คลิก =
 * ลำดับในแกลเลอรี) แล้วดาวน์โหลดเข้า pgallery ของ PIM แบบแทนที่ / ต่อท้าย
 */
export function ImageImport({
    plan,
    productId,
    listingId,
    platformLabel,
    onDone,
}: {
    plan: ImagePlan;
    productId: number;
    listingId: number;
    platformLabel: string;
    onDone: (message: string) => void;
}) {
    // แกลเลอรียังว่าง → เลือกทุกรูปไว้ให้ (แทนที่) / มีรูปแล้ว → ไม่เลือกอะไร (ต่อท้าย)
    const [order, setOrder] = useState<string[]>(plan.current.length === 0 ? plan.source.slice(0, plan.max) : []);
    const [mode, setMode] = useState<'replace' | 'append'>(plan.default_mode);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (url: string) => setOrder((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
    // แกลเลอรีมีได้ไม่เกิน plan.max รูป — "ต่อท้าย" เหลือเท่าที่ว่างอยู่ (ฝั่ง server เช็คซ้ำ)
    const room = mode === 'append' ? Math.max(plan.max - plan.current.length, 0) : plan.max;
    const overRoom = order.length > room;

    const save = () => {
        setSaving(true);
        setError(null);
        fetch(`/catalog/marketplace/products/${productId}/listing-import/${listingId}/images`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: order, mode }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) throw new Error(body.message || 'บันทึกรูปภาพไม่สำเร็จ');
                onDone(body.message);
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setSaving(false));
    };

    if (plan.status !== 'ready') {
        return <FioriMessageStrip severity={plan.status === 'empty' ? 'information' : 'warning'}>{plan.reason}</FioriMessageStrip>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
                <Toolbar design="Transparent" style={{ padding: 0 }}>
                    <Label showColon>
                        บน {platformLabel} ({plan.source.length}) — คลิกเพื่อเลือก ลำดับที่คลิก = ลำดับในแกลเลอรี · เลือกได้อีก {room} รูป
                    </Label>
                    <ToolbarSpacer />
                    <Button design="Transparent" disabled={saving} onClick={() => setOrder(plan.source.slice(0, room))}>
                        เลือกทั้งหมด
                    </Button>
                    <Button design="Transparent" disabled={saving || order.length === 0} onClick={() => setOrder([])}>
                        ล้าง
                    </Button>
                </Toolbar>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {plan.source.map((url, i) => {
                        const position = order.indexOf(url);
                        const isSelected = position !== -1;
                        return (
                            <div key={url} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img
                                    src={url}
                                    alt={`รูปที่ ${i + 1} บน ${platformLabel}`}
                                    loading="lazy"
                                    style={{ ...thumbStyle(isSelected), cursor: saving ? 'default' : 'pointer' }}
                                    onClick={() => !saving && toggle(url)}
                                />
                                <CheckBox
                                    text={isSelected ? `ลำดับ ${position + 1}` : 'เลือก'}
                                    checked={isSelected}
                                    disabled={saving}
                                    accessibleName={`รูปที่ ${i + 1}`}
                                    onChange={() => toggle(url)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <Toolbar design="Transparent" style={{ padding: 0 }}>
                <SegmentedButton
                    accessibleName="วิธีบันทึกรูป"
                    onSelectionChange={(e) =>
                        setMode((e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.mode === 'append' ? 'append' : 'replace')
                    }
                >
                    <SegmentedButtonItem data-mode="replace" selected={mode === 'replace'}>
                        แทนที่แกลเลอรีเดิม
                    </SegmentedButtonItem>
                    <SegmentedButtonItem data-mode="append" selected={mode === 'append'}>
                        ต่อท้ายแกลเลอรีเดิม
                    </SegmentedButtonItem>
                </SegmentedButton>
                <ToolbarSpacer />
                <Button
                    design="Emphasized"
                    icon="download"
                    disabled={order.length === 0 || overRoom || saving}
                    loading={saving}
                    loadingDelay={0}
                    onClick={save}
                >
                    บันทึกรูปลง PIM ({order.length})
                </Button>
            </Toolbar>

            {overRoom && (
                <FioriMessageStrip severity="warning">
                    แกลเลอรีมีได้ไม่เกิน {plan.max} รูป —{' '}
                    {mode === 'append' ? `มีอยู่แล้ว ${plan.current.length} รูป ต่อท้ายได้อีก ${room} รูป` : `เลือกไว้ ${order.length} รูป`} เอาออกอีก{' '}
                    {order.length - room} รูป
                </FioriMessageStrip>
            )}
            {mode === 'replace' && plan.current.length > 0 && (
                <FioriMessageStrip severity="warning">
                    "แทนที่" จะเอารูปเดิม {plan.current.length} รูปออกจากแกลเลอรี (ใช้กับทุกช่องทาง)
                </FioriMessageStrip>
            )}
            {error && (
                <FioriMessageStrip severity="error" onClose={() => setError(null)}>
                    {error}
                </FioriMessageStrip>
            )}
        </div>
    );
}
