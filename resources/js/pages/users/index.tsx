import { useInitials } from '@/hooks/use-initials';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type User } from '@/types';
import { Head } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
    Avatar,
    Box,
    Button,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    TablePagination,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    FioriStatus,
    fioriCardSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Users', href: '/users' }];

const formatDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

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

    // Column pop-in priority (SAP Fiori responsive table): the name
    // (with avatar) identifies the row and stays visible everywhere along
    // with row actions; email is important secondary identity, status is
    // meta, and the join date is the least useful column on a phone.
    const columns: FioriResponsiveColumn<User>[] = [
        {
            key: 'name',
            header: 'ชื่อผู้ใช้งาน',
            priority: 'always',
            render: (user) => (
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32, fontSize: 14 }}>
                        {getInitials(user.name)}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        {user.name}
                    </Typography>
                </Stack>
            ),
        },
        {
            key: 'email',
            header: 'อีเมล',
            priority: 'high',
            render: (user) => (
                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                    {user.email}
                </Typography>
            ),
        },
        {
            key: 'status',
            header: 'สถานะอีเมล',
            priority: 'medium',
            render: (user) => (
                <FioriStatus
                    label={user.email_verified_at ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}
                    tone={user.email_verified_at ? 'success' : 'warning'}
                />
            ),
        },
        {
            key: 'created_at',
            header: 'วันที่สมัคร',
            priority: 'low',
            render: (user) => (
                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                    {formatDate(user.created_at)}
                </Typography>
            ),
        },
        {
            key: 'actions',
            header: 'จัดการ',
            priority: 'always',
            align: 'right',
            render: () => (
                <>
                    <Tooltip title="แก้ไข">
                        <IconButton size="small" sx={fioriIconButtonSx}>
                            <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="ลบ">
                        <IconButton size="small" sx={{ ...fioriIconButtonSx, '&:hover': { bgcolor: FIORI.headerBg, color: FIORI.error } }}>
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 2, md: 3 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            ผู้ใช้งานระบบ
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            ทั้งหมด {users.length} คน
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        <TextField
                            size="small"
                            placeholder="ค้นหาชื่อหรืออีเมล"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(0);
                            }}
                            sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <Button variant="contained" startIcon={<AddIcon />} sx={fioriEmphasizedSx}>
                            เพิ่มผู้ใช้งาน
                        </Button>
                    </Stack>
                </Stack>

                <Paper elevation={0} sx={fioriCardSx}>
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={paged}
                        getRowKey={(user) => user.id}
                        emptyMessage="ไม่พบผู้ใช้งานที่ค้นหา"
                    />
                    <TablePagination
                        component="div"
                        count={filtered.length}
                        page={page}
                        onPageChange={(_, newPage) => setPage(newPage)}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={(event) => {
                            setRowsPerPage(parseInt(event.target.value, 10));
                            setPage(0);
                        }}
                        rowsPerPageOptions={[5, 10, 25]}
                        labelRowsPerPage="แถวต่อหน้า"
                        sx={{ borderTop: `1px solid ${FIORI.border}` }}
                    />
                </Paper>
            </Box>
        </AppLayout>
    );
}
