import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { useInitials } from '@/hooks/use-initials';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type User } from '@/types';
import { Head } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Avatar, Button, FlexBox, Icon, Input, Label, Option, Select, Text, Title } from '@ui5/webcomponents-react';
import { useMemo, useState } from 'react';

import styles from './index.module.css';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Users', href: '/users' }];

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25];

const formatDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

// รูปผู้ใช้ — User type มี avatar_url; ของเดิมอ่าน `avatar` (unknown) เลยเก็บไว้เป็น fallback
const avatarSrc = (user: User) => user.avatar_url ?? (typeof user.avatar === 'string' ? user.avatar : undefined);

export default function UsersIndex({ users }: { users: User[] }) {
    const getInitials = useInitials();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return users;
        return users.filter((user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
    }, [users, search]);

    const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    const lastPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
    const rangeFrom = filtered.length === 0 ? 0 : page * rowsPerPage + 1;
    const rangeTo = Math.min(filtered.length, (page + 1) * rowsPerPage);

    // Column pop-in priority (SAP Fiori responsive table): the name
    // (with avatar) identifies the row and stays visible everywhere along
    // with row actions; email is important secondary identity, status is
    // meta, and the join date is the least useful column on a phone.
    const columns: FioriResponsiveColumn<User>[] = [
        {
            key: 'name',
            header: 'ชื่อผู้ใช้งาน',
            priority: 'always',
            render: (user: User) => {
                const src = avatarSrc(user);
                return (
                    <FlexBox alignItems="Center" style={{ gap: '0.75rem' }}>
                        <Avatar size="XS" initials={src ? undefined : getInitials(user.name)} accessibleName={user.name}>
                            {src && <img src={src} alt={user.name} />}
                        </Avatar>
                        <span style={{ fontWeight: 600, color: 'var(--sapTextColor)' }}>{user.name}</span>
                    </FlexBox>
                );
            },
        },
        {
            key: 'email',
            header: 'อีเมล',
            priority: 'high',
            render: (user: User) => <span style={{ color: 'var(--sapContent_LabelColor)' }}>{user.email}</span>,
        },
        {
            key: 'status',
            header: 'สถานะอีเมล',
            priority: 'medium',
            render: (user: User) => (
                <FioriStatus label={user.email_verified_at ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'} tone={user.email_verified_at ? 'success' : 'warning'} />
            ),
        },
        {
            key: 'created_at',
            header: 'วันที่สมัคร',
            priority: 'low',
            render: (user: User) => <span style={{ color: 'var(--sapContent_LabelColor)' }}>{formatDate(user.created_at)}</span>,
        },
        {
            key: 'actions',
            header: 'จัดการ',
            priority: 'always',
            align: 'right',
            render: () => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    <Button design="Transparent" icon="edit" tooltip="แก้ไข" accessibleName="แก้ไข" />
                    <Button design="Transparent" icon="delete" tooltip="ลบ" accessibleName="ลบ" className={styles.deleteButton} />
                </FlexBox>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />
            <div className={styles.page}>
                <FlexBox alignItems="Center" justifyContent="SpaceBetween" wrap="Wrap" style={{ gap: '1rem' }}>
                    <div>
                        <Title level="H4" size="H4">
                            ผู้ใช้งานระบบ
                        </Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem' }}>ทั้งหมด {users.length} คน</Text>
                    </div>
                    <FlexBox style={{ gap: '0.75rem' }}>
                        <Input
                            placeholder="ค้นหาชื่อหรืออีเมล"
                            value={search}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 240 }}
                            onInput={(event) => {
                                setSearch(event.target.value);
                                setPage(0);
                            }}
                        />
                        <Button design="Emphasized" icon="add">
                            เพิ่มผู้ใช้งาน
                        </Button>
                    </FlexBox>
                </FlexBox>

                <div className={styles.card}>
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={paged}
                        getRowKey={(user: User) => user.id}
                        emptyMessage="ไม่พบผู้ใช้งานที่ค้นหา"
                    />
                    <FlexBox alignItems="Center" justifyContent="End" wrap="Wrap" className={styles.pagination}>
                        <Label showColon={false}>แถวต่อหน้า</Label>
                        <Select
                            value={String(rowsPerPage)}
                            style={{ width: '5rem' }}
                            onChange={(event) => {
                                setRowsPerPage(parseInt(event.detail.selectedOption.value ?? '10', 10));
                                setPage(0);
                            }}
                        >
                            {ROWS_PER_PAGE_OPTIONS.map((option) => (
                                <Option key={option} value={String(option)}>
                                    {option}
                                </Option>
                            ))}
                        </Select>
                        <Text>
                            {rangeFrom}–{rangeTo} of {filtered.length}
                        </Text>
                        <Button
                            design="Transparent"
                            icon="slim-arrow-left"
                            accessibleName="Previous page"
                            tooltip="Previous page"
                            disabled={page === 0}
                            onClick={() => setPage(page - 1)}
                        />
                        <Button
                            design="Transparent"
                            icon="slim-arrow-right"
                            accessibleName="Next page"
                            tooltip="Next page"
                            disabled={page >= lastPage}
                            onClick={() => setPage(page + 1)}
                        />
                    </FlexBox>
                </div>
            </div>
        </AppLayout>
    );
}
