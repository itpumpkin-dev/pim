import AppLogo from '@/components/app-logo';
import { useForm } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import PersonIcon from '@mui/icons-material/Person';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { Alert, Avatar, Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, Divider, FormControlLabel, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { ChangeEvent, FormEventHandler, useEffect, useState } from 'react';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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

const labelSx = { fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 };

function RequiredMark() {
    return (
        <Box component="span" aria-hidden sx={{ color: FIORI.error, ml: 0.25 }}>
            *
        </Box>
    );
}

export default function CreateUserDialog({ open, onClose, managerOptions = [] }: CreateUserDialogProps) {
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
    useEffect(() => () => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

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
        onClose();
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('system.user.store'), {
            preserveScroll: true,
            onSuccess: () => handleClose(),
        });
    };

    const textInput = (key: keyof CreateUserForm, type = 'text') => (
        <TextField
            fullWidth
            size="small"
            type={type}
            value={data[key]}
            onChange={(e) => {
                setData(key, e.target.value);
                clearErrors(key);
            }}
            error={Boolean(errors[key])}
            helperText={errors[key]}
            autoComplete={type === 'password' ? 'new-password' : 'off'}
        />
    );

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth component="form" onSubmit={submit}>
            <DialogContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <AppLogo />
                    </Box>
                    <IconButton size="small" onClick={handleClose} sx={{ mt: -1, mr: -1 }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Typography variant="overline" sx={{ color: FIORI.textSecondary, fontWeight: 700, display: 'block', lineHeight: 1 }}>
                    USERS
                </Typography>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                    CREATE
                </Typography>
                <Divider sx={{ mb: 3, borderColor: FIORI.border }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box>
                        <Typography variant="body2" sx={labelSx}>
                            Username
                            <RequiredMark />
                        </Typography>
                        {textInput('username')}
                    </Box>

                    <Box>
                        <Typography variant="body2" sx={labelSx}>
                            Employee ID
                            <RequiredMark />
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.employee_id}
                                onChange={(e) => {
                                    setData('employee_id', e.target.value);
                                    clearErrors('employee_id');
                                    clearFetched();
                                }}
                                onKeyDown={(e) => {
                                    // Enter ในช่องนี้ = ดึงข้อมูล ไม่ใช่ submit ฟอร์มทั้งใบ
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        fetchEmployee();
                                    }
                                }}
                                error={Boolean(errors.employee_id)}
                                helperText={errors.employee_id}
                                autoComplete="off"
                            />
                            <Button
                                variant="outlined"
                                onClick={fetchEmployee}
                                disabled={!data.employee_id.trim() || fetching}
                                startIcon={fetching ? <CircularProgress size={14} color="inherit" /> : <CloudDownloadIcon fontSize="small" />}
                                sx={{ ...fioriDefaultSx, whiteSpace: 'nowrap', flexShrink: 0, height: 40 }}
                            >
                                ดึงข้อมูล
                            </Button>
                        </Box>
                        {fetchMessage && (
                            <Alert severity={fetchMessage.severity} sx={{ mt: 1, py: 0 }}>
                                {fetchMessage.text}
                            </Alert>
                        )}
                    </Box>

                    {/* รูปโปรไฟล์ — อัปโหลดเองได้เลย (ชนะรูปจาก HR เสมอ) หรือถ้ากดดึงข้อมูล
                    แล้วพนักงานมีรูปใน HR ก็ติ๊กใช้รูปนั้นได้ ไม่เลือกอะไรเลยก็ได้ */}
                    <Box>
                        <Typography variant="body2" sx={labelSx}>
                            Profile photo
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Avatar
                                src={shownPhoto ?? undefined}
                                variant="rounded"
                                sx={{ width: 72, height: 72, bgcolor: FIORI.border, color: FIORI.textSecondary }}
                                slotProps={{
                                    img: {
                                        // รูป HR โหลดไม่ได้ (Lark ล่ม/รูปถูกลบ) — ตัดตัวเลือกนี้ทิ้ง ไม่ส่งไปบันทึก
                                        onError: () => {
                                            if (!data.avatar) {
                                                setPhotoUrl(null);
                                                setData('use_lark_photo', false);
                                            }
                                        },
                                    },
                                }}
                            >
                                <PersonIcon fontSize="large" />
                            </Avatar>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Button
                                        component="label"
                                        variant="outlined"
                                        size="small"
                                        startIcon={<PhotoCameraIcon fontSize="small" />}
                                        sx={fioriDefaultSx}
                                    >
                                        {data.avatar ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                                        <input type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                                    </Button>
                                    {data.avatar && (
                                        <Button variant="text" size="small" color="inherit" onClick={removeAvatar} sx={{ color: FIORI.textSecondary }}>
                                            ลบ
                                        </Button>
                                    )}
                                </Box>
                                {photoUrl && !data.avatar && (
                                    <FormControlLabel
                                        sx={{ ml: -0.5 }}
                                        control={<Checkbox size="small" checked={data.use_lark_photo} onChange={(e) => setData('use_lark_photo', e.target.checked)} />}
                                        label={<Typography variant="body2">ใช้รูปจากระบบ HR</Typography>}
                                    />
                                )}
                                <Typography variant="caption" sx={{ color: errors.avatar ? FIORI.error : FIORI.textSecondary }}>
                                    {errors.avatar || 'JPG / PNG ไม่เกิน 2MB'}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {fields.map((field) => (
                        <Box key={field.key}>
                            <Typography variant="body2" sx={labelSx}>
                                {field.label}
                                <RequiredMark />
                            </Typography>
                            {textInput(field.key, field.type)}
                        </Box>
                    ))}

                    {textFields.map((field) => (
                        <Box key={field.key}>
                            <Typography variant="body2" sx={labelSx}>
                                {field.label}
                            </Typography>
                            {textInput(field.key)}
                        </Box>
                    ))}

                    <Box>
                        <Typography variant="body2" sx={labelSx}>
                            Reports to
                        </Typography>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            value={data.manager_id}
                            onChange={(e) => {
                                setData('manager_id', e.target.value === '' ? '' : Number(e.target.value));
                                clearErrors('manager_id');
                            }}
                            error={Boolean(errors.manager_id)}
                            helperText={errors.manager_id}
                        >
                            <MenuItem value="">—</MenuItem>
                            {managerOptions.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                    {option.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
                    <Button variant="contained" color="inherit" onClick={handleClose} sx={{ ...fioriDefaultSx, px: 4 }}>
                        CANCEL
                    </Button>
                    <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ ...fioriEmphasizedSx, px: 4 }}>
                        {processing ? 'SAVING…' : 'SAVE'}
                    </Button>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
