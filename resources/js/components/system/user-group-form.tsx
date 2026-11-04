import AppLayout from '@/layouts/app-layout';
import { codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Button, FlexBox, Input, Label, MultiComboBox, MultiComboBoxItem, Switch, Text, TextArea, Title } from '@ui5/webcomponents-react';
import { FormEventHandler, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './user-group-form.module.css';
// TODO(New Group): ปลดคอมเมนต์พร้อมกับตาราง Users ด้านล่าง (+ import { CheckBox } from '@ui5/webcomponents-react')
// import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'USER GROUPS',
        href: '/system/userGroup',
    },
];

interface UserGroupUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface RoleOption {
    id: number;
    label: string;
}

interface UserGroupFormProps {
    /** Create only: prefilled into the Code field (next free group_N). */
    suggestedCode?: string;
    /** Edit only: whether the user holds user_groups.edit_code. */
    canEditCode?: boolean;
    users: UserGroupUserOption[];
    roles: RoleOption[];
    group?: {
        id: number;
        code: string;
        name: string;
        is_active: boolean;
        description: string | null;
        user_ids: number[];
        role_ids: number[];
    };
}

interface UserGroupForm {
    code: string;
    name: string;
    description: string;
    is_active: boolean;
    users: number[];
    roles: number[];
    [key: string]: string | boolean | number[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `users` is only consumed by the commented-out Users table (TODO New Group)
export default function UserGroupFormPage({ suggestedCode, canEditCode = false, users, roles, group }: UserGroupFormProps) {
    const isEdit = Boolean(group);
    const { t: tCatalog } = useTranslation('catalog');
    // Anyone may pick the code on create; renaming it later needs user_groups.edit_code.
    const codeEditable = !isEdit || canEditCode;

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<UserGroupForm>({
        code: group?.code ?? suggestedCode ?? '',
        name: group?.name ?? '',
        description: group?.description ?? '',
        is_active: group?.is_active ?? true,
        users: group?.user_ids ?? [],
        roles: group?.role_ids ?? [],
    });

    const cancel = () => router.visit('/system/userGroup');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && group) {
            put(`/system/userGroup/${group.id}`);
        } else {
            post('/system/userGroup');
        }
    };

    // TODO(New Group): ส่วนเลือก Users (checkbox "Has Group") ยังไม่ต้องมีบนหน้านี้
    // — คอมเมนต์ไว้ก่อน ปลดคอมเมนต์ทั้ง toggleUser + userColumns + บล็อก <div> "Users"
    // ในส่วน render เมื่อ flow พร้อม
    // const toggleUser = (userId: number) => {
    //     setData('users', data.users.includes(userId) ? data.users.filter((id) => id !== userId) : [...data.users, userId]);
    // };

    // Column pop-in priority (SAP Fiori responsive table): the "Has Group"
    // checkbox is the control being edited here, so it stays always visible
    // alongside Username (the natural identifier); the rest are descriptive
    // and reflow into the pop-in area first as space runs out.
    // const userColumns: FioriResponsiveColumn<UserGroupUserOption>[] = [
    //     {
    //         key: 'hasGroup',
    //         header: 'Has Group',
    //         priority: 'always',
    //         render: (user) => <CheckBox checked={data.users.includes(user.id)} onChange={() => toggleUser(user.id)} />,
    //     },
    //     {
    //         key: 'employeeId',
    //         header: 'Employee ID',
    //         priority: 'low',
    //         render: (user) => user.employee_id || '-',
    //     },
    //     {
    //         key: 'username',
    //         header: 'Username',
    //         priority: 'high',
    //         render: (user) => user.username,
    //     },
    //     {
    //         key: 'email',
    //         header: 'E-mail',
    //         priority: 'medium',
    //         render: (user) => user.email,
    //     },
    //     {
    //         key: 'firstName',
    //         header: 'First name',
    //         priority: 'medium',
    //         render: (user) => user.first_name,
    //     },
    //     {
    //         key: 'lastName',
    //         header: 'Last name',
    //         priority: 'low',
    //         render: (user) => user.last_name,
    //     },
    // ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isEdit ? `Edit ${group?.name}` : 'Create Group'} />
            <form id="user-group-form" onSubmit={submit} className={styles.form}>
                <div className={styles.body}>
                    <Title level="H3" style={{ marginBottom: '1.5rem' }}>
                        {isEdit ? group?.name : 'New Group'}
                    </Title>

                    <FlexBox alignItems="Start" wrap="Wrap" style={{ gap: '2rem' }}>
                        {/* TODO(New Group): ส่วน Users (ตาราง + checkbox "Has Group") ยังไม่ต้องมี — ปลดคอมเมนต์เมื่อพร้อม
                        <div style={{ flex: 1, minWidth: 320 }}>
                            <Title level="H4" style={{ marginBottom: '0.5rem' }}>
                                Users
                            </Title>
                            <div className={styles.divider} />
                            <FioriResponsiveTable
                                columns={userColumns}
                                rows={users}
                                getRowKey={(user) => user.id}
                                rowClassName={(user) => (data.users.includes(user.id) ? styles.selectedRow : undefined)}
                                emptyMessage="No users found."
                            />
                        </div>

                        <div className={styles.verticalDivider} />
                        */}

                        <div style={{ width: 320, flexShrink: 0 }}>
                            <Title level="H4" style={{ marginBottom: '1rem' }}>
                                General
                            </Title>
                            <FlexBox direction="Column" style={{ gap: '1.25rem' }}>
                                <div>
                                    <FieldLabel htmlFor="user-group-code" required>
                                        User Group Code
                                    </FieldLabel>
                                    <Input
                                        id="user-group-code"
                                        style={{ width: '100%' }}
                                        value={data.code}
                                        disabled={!codeEditable}
                                        placeholder="e.g. group_1"
                                        onInput={(e) => {
                                            setData('code', normalizeCodeInput(e.target.value));
                                            clearErrors('code');
                                        }}
                                        valueState={errors.code ? 'Negative' : 'None'}
                                        valueStateMessage={errors.code ? <div>{errors.code}</div> : undefined}
                                    />
                                    <HelperText error={errors.code}>{tCatalog(codeHintKey({ canEditCode: codeEditable }))}</HelperText>
                                </div>
                                <div>
                                    <FieldLabel htmlFor="user-group-name" required>
                                        Name
                                    </FieldLabel>
                                    <Input
                                        id="user-group-name"
                                        style={{ width: '100%' }}
                                        value={data.name}
                                        onInput={(e) => {
                                            setData('name', e.target.value);
                                            clearErrors('name');
                                        }}
                                        valueState={errors.name ? 'Negative' : 'None'}
                                        valueStateMessage={errors.name ? <div>{errors.name}</div> : undefined}
                                    />
                                    <HelperText error={errors.name} />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="user-group-description" required>
                                        Description
                                    </FieldLabel>
                                    <TextArea
                                        id="user-group-description"
                                        style={{ width: '100%' }}
                                        rows={3}
                                        growing
                                        placeholder="Description"
                                        value={data.description}
                                        onInput={(e) => {
                                            setData('description', e.target.value);
                                            clearErrors('description');
                                        }}
                                        valueState={errors.description ? 'Negative' : 'None'}
                                        valueStateMessage={errors.description ? <div>{errors.description}</div> : undefined}
                                    />
                                    <HelperText error={errors.description} />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="user-group-status">Status</FieldLabel>
                                    <FlexBox alignItems="Center" style={{ gap: '0.5rem' }}>
                                        <Switch
                                            id="user-group-status"
                                            checked={data.is_active}
                                            onChange={(e) => setData('is_active', e.target.checked)}
                                        />
                                        <Text>{data.is_active ? 'Active' : 'Inactive'}</Text>
                                    </FlexBox>
                                    <HelperText error={errors.is_active} />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="user-group-roles">Roles</FieldLabel>
                                    <MultiComboBox
                                        id="user-group-roles"
                                        style={{ width: '100%' }}
                                        placeholder="Select roles"
                                        selectedValues={data.roles.map(String)}
                                        onSelectionChange={(e) =>
                                            setData(
                                                'roles',
                                                e.detail.items.map((item) => Number(item.value)).filter((id) => !Number.isNaN(id)),
                                            )
                                        }
                                        valueState={errors.roles ? 'Negative' : 'None'}
                                        valueStateMessage={errors.roles ? <div>{errors.roles}</div> : undefined}
                                    >
                                        {roles.map((role) => (
                                            <MultiComboBoxItem key={role.id} value={String(role.id)} text={role.label} />
                                        ))}
                                    </MultiComboBox>
                                    <HelperText error={errors.roles} />
                                </div>
                            </FlexBox>
                        </div>
                    </FlexBox>
                </div>

                {/* Fiori footer action bar — ปุ่มอยู่ล่างสุด ติดขอบ ไม่ใช่บน header */}
                <div className={styles.footer}>
                    <Button onClick={cancel}>CANCEL</Button>
                    <Button type="Submit" design="Emphasized" disabled={processing} loading={processing} loadingDelay={0}>
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </form>
        </AppLayout>
    );
}

function FieldLabel({ htmlFor, required = false, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
    return (
        <Label
            for={htmlFor}
            required={required}
            showColon={false}
            wrappingType="Normal"
            style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}
        >
            {children}
        </Label>
    );
}

/** error (สีแดง) ถ้ามี ไม่งั้นแสดง hint ปกติ — แทน helperText ของ MUI TextField */
function HelperText({ error, children }: { error?: string; children?: ReactNode }) {
    const content = error ?? children;
    if (!content) return null;
    return <span className={error ? `${styles.helper} ${styles.helperError}` : styles.helper}>{content}</span>;
}
