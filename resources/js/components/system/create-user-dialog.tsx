import AppLogo from '@/components/app-logo';
import { FioriMessageStrip } from '@/components/fiori-form';
import { useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/camera.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/person-placeholder.js';
import '@ui5/webcomponents-icons/dist/show.js';
import { Button, CheckBox, Dialog, Icon, Input, Label, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { ChangeEvent, FormEventHandler, ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ManagerOption {
    id: number;
    name: string;
}

interface CreateUserForm {
    username: string;
    employee_id: string;
    password: string;
    password_confirmation: string;
    first_name: string;
    last_name: string;
    email: string;
    department_name: string;
    job_position_name: string;
    manager_id: number | '';
    use_lark_photo: boolean;
    avatar: File | null;
    [key: string]: string | number | boolean | File | null;
}

interface CreateUserDialogProps {
    open: boolean;
    onClose: () => void;
    managerOptions?: ManagerOption[];
}

interface LarkEmployee {
    employee_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    department: string | null;
    job_position: string | null;
    has_photo: boolean;
}

// Username/Employee ID render แยกด้านบน (Employee ID มีปุ่ม "ดึงข้อมูล" ของตัวเอง)
const fields: { key: keyof CreateUserForm; label: string; type?: string }[] = [
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'password_confirmation', label: 'Password (repeat)', type: 'password' },
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'email', label: 'Email', type: 'email' },
];

// แผนก/ตำแหน่งเป็นข้อความอิสระ (ไม่ใช่ select แล้ว) — ปกติเติมมาจาก "ดึงข้อมูล"
// (PRO_DEPT / JBT_THAIDESC) backend ผูกเข้า master ตามชื่อให้เอง ดู
// UserController::resolveByName()
const textFields: { key: keyof CreateUserForm; label: string }[] = [
    { key: 'department_name', label: 'Department' },
    { key: 'job_position_name', label: 'Job position' },
];

// เท่ากับ 'avatar' => max:2048 ใน StoreUserRequest/UpdateUserRequest — เช็คก่อนส่งจะได้ไม่ต้องรอ server
const AVATAR_MAX_BYTES = 2048 * 1024;

const UI5_INPUT_TYPE: Record<string, 'Text' | 'Password' | 'Email'> = {
    text: 'Text',
    password: 'Password',
    email: 'Email',
};

const fieldMessageStyle = { display: 'block', marginTop: '0.25rem', fontSize: 'var(--sapFontSmallSize)' } as const;

function FieldBlock({
    id,
    label,
    required = false,
    error,
    children,
}: {
    id?: string;
    label: string;
    required?: boolean;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <Label for={id} required={required} showColon={false} style={{ fontWeight: 600, color: 'var(--sapTextColor)' }}>
                {label}
            </Label>
            {children}
            {error && <span style={{ ...fieldMessageStyle, color: 'var(--sapNegativeTextColor, var(--sapNegativeColor))' }}>{error}</span>}
        </div>
    );
}

export default function CreateUserDialog({ open, onClose, managerOptions = [] }: CreateUserDialogProps) {
    const { t } = useTranslation('system');
    // ลูกตาแสดง/ซ่อนรหัสผ่าน แยกต่อช่อง (Password / Password (repeat)) — แบบเดียวกับหน้า Edit User
    const [visiblePasswords, setVisiblePasswords] = useState<Partial<Record<keyof CreateUserForm, boolean>>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { data, setData, post, processing, errors, reset, clearErrors, setError } = useForm<CreateUserForm>({
        username: '',
        employee_id: '',
        password: '',
        password_confirmation: '',
        first_name: '',
        last_name: '',
        email: '',
        department_name: '',
        job_position_name: '',
        manager_id: '',
        use_lark_photo: false,
        avatar: null,
    });

    // ปุ่ม "ดึงข้อมูล" — ค้นพนักงานจากตาราง HR ใน Lark ด้วย Employee ID (PRS_NO)
    // แล้วเติมชื่อ/นามสกุล/อีเมล/แผนก/ตำแหน่งให้ ไม่บังคับกด (กรอกเองได้) และ
    // ไม่ทับช่องที่ Lark ไม่มีค่า (เช่น พนักงานบางคนไม่มีอีเมลในระบบ HR)
    const [fetching, setFetching] = useState(false);
    const [fetchMessage, setFetchMessage] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);
    // รูปพรีวิวจาก EMP_PHOTO (ผ่าน backend proxy — URL ของ Lark ต้องใช้ tenant token)
    // ผูกกับ employee id ที่ดึงมา ถ้าแก้ Employee ID ทีหลังจะล้างทิ้งพร้อมติ๊ก
    // use_lark_photo ออก กันไม่ให้บันทึกรูปของอีกคนติดไป
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);

    const clearFetched = () => {
        setFetchMessage(null);
        setPhotoUrl(null);
        setData('use_lark_photo', false);
    };

    const fetchEmployee = async () => {
        const employeeId = data.employee_id.trim();
        if (!employeeId || fetching) return;

        setFetching(true);
        clearFetched();
        try {
            const res = await fetch(`${route('system.user.larkEmployee')}?employee_id=${encodeURIComponent(employeeId)}`, {
                headers: { Accept: 'application/json' },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.employee) {
                throw new Error(body.message || `HTTP ${res.status}`);
            }

            const employee: LarkEmployee = body.employee;
            const filled: Record<string, string> = {};
            if (employee.first_name) filled.first_name = employee.first_name;
            if (employee.last_name) filled.last_name = employee.last_name;
            if (employee.email) filled.email = employee.email.toLowerCase();
            if (employee.department) filled.department_name = employee.department;
            if (employee.job_position) filled.job_position_name = employee.job_position;

            setData((prev) => ({ ...prev, ...filled, use_lark_photo: employee.has_photo }) as CreateUserForm);
            setPhotoUrl(employee.has_photo ? `${route('system.user.larkEmployeePhoto')}?employee_id=${encodeURIComponent(employeeId)}` : null);
            clearErrors(...(Object.keys(filled) as (keyof CreateUserForm)[]));

            const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ');
            setFetchMessage(
                employee.email
                    ? { severity: 'success', text: `ดึงข้อมูล ${name} แล้ว` }
                    : { severity: 'warning', text: `ดึงข้อมูล ${name} แล้ว — ไม่มีอีเมลในระบบ HR กรุณากรอกเอง` },
            );
        } catch (e) {
            setFetchMessage({ severity: 'error', text: e instanceof Error ? e.message : String(e) });
        } finally {
            setFetching(false);
        }
    };

    // รูปที่อัปโหลดเอง — ชนะรูปจาก HR เสมอ (อัปโหลดแล้วติ๊ก use_lark_photo ออกให้เลย
    // กดลบรูปที่อัปโหลดแล้วถ้ามีรูป HR อยู่ก็กลับไปใช้รูปนั้นแทน)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    useEffect(
        () => () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        },
        [avatarPreview],
    );

    const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้หลังกดลบ
        if (!file) return;

        if (file.size > AVATAR_MAX_BYTES) {
            setError('avatar', 'รูปใหญ่เกิน 2MB');
            return;
        }

        clearErrors('avatar');
        setData((prev) => ({ ...prev, avatar: file, use_lark_photo: false }));
        setAvatarPreview(URL.createObjectURL(file));
    };

    const removeAvatar = () => {
        clearErrors('avatar');
        setData((prev) => ({ ...prev, avatar: null, use_lark_photo: Boolean(photoUrl) }));
        setAvatarPreview(null);
    };

    const shownPhoto = avatarPreview ?? (data.use_lark_photo ? photoUrl : null);

    const handleClose = () => {
        clearErrors();
        reset();
        setFetchMessage(null);
        setPhotoUrl(null);
        setAvatarPreview(null);
        setVisiblePasswords({});
        onClose();
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('system.user.store'), {
            preserveScroll: true,
            onSuccess: () => handleClose(),
        });
    };

    const textInput = (key: keyof CreateUserForm, type = 'text') => {
        const isPassword = type === 'password';
        const visible = isPassword && Boolean(visiblePasswords[key]);
        const id = `create-user-${String(key)}`;

        return (
            <Input
                id={id}
                style={{ width: '100%' }}
                type={visible ? 'Text' : (UI5_INPUT_TYPE[type] ?? 'Text')}
                value={String(data[key] ?? '')}
                onInput={(e) => {
                    setData(key, e.target.value);
                    clearErrors(key);
                }}
                valueState={errors[key] ? 'Negative' : 'None'}
                icon={
                    isPassword ? (
                        <Icon
                            name={visible ? 'hide' : 'show'}
                            mode="Interactive"
                            accessibleName={visible ? t('hidePassword') : t('showPassword')}
                            showTooltip
                            onClick={() => setVisiblePasswords((prev) => ({ ...prev, [key]: !prev[key] }))}
                        />
                    ) : undefined
                }
            />
        );
    };

    return (
        <Dialog
            open={open}
            // Dialog ปิดตัวเองเมื่อกด ESC — sync state กลับ (แต่ไม่เรียกซ้ำตอนที่ parent ปิดให้แล้ว)
            onClose={() => {
                if (open) handleClose();
            }}
            style={{ width: '444px', maxWidth: 'calc(100vw - 2rem)' }}
        >
            <form onSubmit={submit} style={{ padding: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <AppLogo />
                    </div>
                    <Button design="Transparent" icon="decline" tooltip="Close" accessibleName="Close" onClick={handleClose} />
                </div>

                <Text
                    style={{
                        display: 'block',
                        color: 'var(--sapContent_LabelColor)',
                        fontWeight: 700,
                        fontSize: 'var(--sapFontSmallSize)',
                        letterSpacing: '0.08em',
                        lineHeight: 1,
                    }}
                >
                    USERS
                </Text>
                <Title level="H2" size="H3" style={{ marginBottom: '1rem' }}>
                    CREATE
                </Title>
                <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)', marginBottom: '1.5rem' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <FieldBlock id="create-user-username" label="Username" required error={errors.username}>
                        {textInput('username')}
                    </FieldBlock>

                    <FieldBlock id="create-user-employee-id" label="Employee ID" required error={errors.employee_id}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                            <Input
                                id="create-user-employee-id"
                                style={{ flex: 1, minWidth: 0 }}
                                value={data.employee_id}
                                onInput={(e) => {
                                    setData('employee_id', e.target.value);
                                    clearErrors('employee_id');
                                    clearFetched();
                                }}
                                onKeyDownCapture={(e) => {
                                    // Enter ในช่องนี้ = ดึงข้อมูล ไม่ใช่ submit ฟอร์มทั้งใบ
                                    // (capture phase — กันไม่ให้ UI5 Input ส่ง submit ฟอร์มเอง)
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        fetchEmployee();
                                    }
                                }}
                                valueState={errors.employee_id ? 'Negative' : 'None'}
                            />
                            <Button
                                icon={fetching ? undefined : 'download'}
                                onClick={fetchEmployee}
                                disabled={!data.employee_id.trim() || fetching}
                                loading={fetching}
                                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                            >
                                ดึงข้อมูล
                            </Button>
                        </div>
                        {fetchMessage && (
                            <FioriMessageStrip severity={fetchMessage.severity} style={{ marginTop: '0.5rem' }}>
                                {fetchMessage.text}
                            </FioriMessageStrip>
                        )}
                    </FieldBlock>

                    {/* รูปโปรไฟล์ — อัปโหลดเองได้เลย (ชนะรูปจาก HR เสมอ) หรือถ้ากดดึงข้อมูล
                    แล้วพนักงานมีรูปใน HR ก็ติ๊กใช้รูปนั้นได้ ไม่เลือกอะไรเลยก็ได้ */}
                    <FieldBlock label="Profile photo">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div
                                style={{
                                    width: 72,
                                    height: 72,
                                    flexShrink: 0,
                                    borderRadius: 'var(--sapElement_BorderCornerRadius, 8px)',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'var(--sapGroup_ContentBorderColor)',
                                    color: 'var(--sapContent_LabelColor)',
                                }}
                            >
                                {shownPhoto ? (
                                    <img
                                        src={shownPhoto}
                                        alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        // รูป HR โหลดไม่ได้ (Lark ล่ม/รูปถูกลบ) — ตัดตัวเลือกนี้ทิ้ง ไม่ส่งไปบันทึก
                                        onError={() => {
                                            if (!data.avatar) {
                                                setPhotoUrl(null);
                                                setData('use_lark_photo', false);
                                            }
                                        }}
                                    />
                                ) : (
                                    <Icon name="person-placeholder" style={{ width: 36, height: 36, color: 'var(--sapContent_LabelColor)' }} />
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem', minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <Button icon="camera" onClick={() => fileInputRef.current?.click()}>
                                        {data.avatar ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                                    </Button>
                                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                                    {data.avatar && (
                                        <Button design="Transparent" onClick={removeAvatar}>
                                            ลบ
                                        </Button>
                                    )}
                                </div>
                                {photoUrl && !data.avatar && (
                                    <CheckBox
                                        text="ใช้รูปจากระบบ HR"
                                        checked={data.use_lark_photo}
                                        onChange={(e) => setData('use_lark_photo', e.target.checked)}
                                    />
                                )}
                                <span
                                    style={{
                                        fontSize: 'var(--sapFontSmallSize)',
                                        color: errors.avatar
                                            ? 'var(--sapNegativeTextColor, var(--sapNegativeColor))'
                                            : 'var(--sapContent_LabelColor)',
                                    }}
                                >
                                    {errors.avatar || 'JPG / PNG ไม่เกิน 2MB'}
                                </span>
                            </div>
                        </div>
                    </FieldBlock>

                    {fields.map((field) => (
                        <FieldBlock key={field.key} id={`create-user-${String(field.key)}`} label={field.label} required error={errors[field.key]}>
                            {textInput(field.key, field.type)}
                        </FieldBlock>
                    ))}

                    {textFields.map((field) => (
                        <FieldBlock key={field.key} id={`create-user-${String(field.key)}`} label={field.label} error={errors[field.key]}>
                            {textInput(field.key)}
                        </FieldBlock>
                    ))}

                    <FieldBlock id="create-user-manager" label="Reports to" error={errors.manager_id}>
                        <Select
                            id="create-user-manager"
                            style={{ width: '100%' }}
                            value={String(data.manager_id)}
                            onChange={(e) => {
                                const value = e.detail.selectedOption.value;
                                setData('manager_id', value ? Number(value) : '');
                                clearErrors('manager_id');
                            }}
                            valueState={errors.manager_id ? 'Negative' : 'None'}
                        >
                            <Option value="">—</Option>
                            {managerOptions.map((option) => (
                                <Option key={option.id} value={String(option.id)}>
                                    {option.name}
                                </Option>
                            ))}
                        </Select>
                    </FieldBlock>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                    <Button onClick={handleClose} style={{ minWidth: '6rem' }}>
                        CANCEL
                    </Button>
                    <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} style={{ minWidth: '6rem' }}>
                        {processing ? 'SAVING…' : 'SAVE'}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
