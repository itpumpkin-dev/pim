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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
    FIORI,
    FioriStatus,
    fioriBodyCellSx,
    fioriCardSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
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

                <TableContainer component={Paper} elevation={0} sx={fioriCardSx}>
                    <Table>
                        <TableHead sx={fioriTableHeadSx}>
                            <TableRow>
                                <TableCell sx={fioriTableHeadCellSx}>ชื่อผู้ใช้งาน</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>อีเมล</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>สถานะอีเมล</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>วันที่สมัคร</TableCell>
                                <TableCell align="right" sx={fioriTableHeadCellSx}>จัดการ</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paged.map((user) => (
                                <TableRow key={user.id} sx={fioriTableRowSx(false)}>
                                    <TableCell sx={fioriBodyCellSx}>
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32, fontSize: 14 }}>
                                                {getInitials(user.name)}
                                            </Avatar>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                                                {user.name}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={fioriBodyCellSx}>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                            {user.email}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={fioriBodyCellSx}>
                                        <FioriStatus
                                            label={user.email_verified_at ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}
                                            tone={user.email_verified_at ? 'success' : 'warning'}
                                        />
                                    </TableCell>
                                    <TableCell sx={fioriBodyCellSx}>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                            {formatDate(user.created_at)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={fioriBodyCellSx}>
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
                                    </TableCell>
                                </TableRow>
                            ))}
                            {paged.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                            ไม่พบผู้ใช้งานที่ค้นหา
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
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
                </TableContainer>
            </Box>
        </AppLayout>
    );
}
